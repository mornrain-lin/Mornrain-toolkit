/**
 * html2pptx - 将HTML幻灯片转换为pptxgenjs幻灯片，支持精确定位元素
 * 
 * 功能说明：
 *   这个模块使用 Playwright 浏览器引擎来解析HTML，提取所有元素的位置、样式和内容，
 *   然后使用 PptxGenJS 库将这些元素转换为 PowerPoint 幻灯片。
 * 
 * 使用示例：
 *   const pptx = new pptxgen();
 *   pptx.layout = 'LAYOUT_16x9';  // 必须与HTML body的尺寸匹配
 *
 *   const { slide, placeholders } = await html2pptx('slide.html', pptx);
 *   slide.addChart(pptx.charts.LINE, data, placeholders[0]);
 *
 *   await pptx.writeFile('output.pptx');
 *
 * 主要功能：
 *   - 将HTML转换为PowerPoint，保持精确的元素定位
 *   - 支持文本、图片、形状和项目符号列表
 *   - 提取占位符元素（class="placeholder"）及其位置，用于后续添加图表等
 *   - 处理CSS渐变、边框和边距
 *
 * 验证功能：
 *   - 使用HTML body的宽高来设置视口尺寸
 *   - 如果HTML尺寸与演示文稿布局不匹配，抛出错误
 *   - 如果内容溢出body，抛出错误（包含溢出详情）
 *
 * 返回值：
 *   { slide, placeholders } 
 *   - slide: 生成的幻灯片对象
 *   - placeholders: 占位符数组，每个元素包含 { id, x, y, w, h }
 */

// 引入依赖库
const { chromium } = require('playwright');  // 用于启动浏览器并解析HTML
const path = require('path');                 // 路径处理工具
const sharp = require('sharp');               // 图片处理库（用于SVG转PNG）
const fs = require('fs');                     // 文件系统操作

// ============================================================================
// 日志工具：根据 isDebug 参数控制日志输出
// ============================================================================
let _isDebug = false;

/**
 * 设置调试模式
 * @param {boolean} debug - 是否启用调试模式
 */
function setDebugMode(debug) {
    _isDebug = debug;
}

/**
 * 日志工具对象
 * - log: 仅在 isDebug=true 时输出
 * - warn: 仅在 isDebug=true 时输出
 * - error: 始终输出
 */
const logger = {
    log: (...args) => {
        if (_isDebug) {
            console.log(...args);
        }
    },
    warn: (...args) => {
        if (_isDebug) {
            console.warn(...args);
        }
    },
    error: (...args) => {
        console.error(...args);
    }
};

// ============================================================================
// 单位转换常量
// ============================================================================
// 这些常量用于在不同单位之间进行转换
const PT_PER_PX = 0.75;      // 点（Point）到像素的转换比例：1像素 = 0.75点
const PX_PER_IN = 96;        // 像素到英寸的转换：96像素 = 1英寸（标准DPI）
const EMU_PER_IN = 914400;   // EMU（English Metric Units）到英寸：PowerPoint内部使用的单位

/**
 * 辅助函数：获取body尺寸并检查内容溢出
 * 
 * 功能：
 *   1. 在浏览器中获取body元素的实际尺寸（width/height）
 *   2. 获取内容的滚动尺寸（scrollWidth/scrollHeight）
 *   3. 比较两者，如果内容超出body边界，记录错误
 * 
 * 为什么需要检查溢出？
 *   - PowerPoint对内容位置有严格要求，内容不能超出幻灯片边界
 *   - 如果HTML内容溢出，转换后的PPTX文件可能会损坏或显示异常
 * 
 * @param {Page} page - Playwright页面对象
 * @returns {Object} 包含body尺寸和错误信息的对象
 */
async function getBodyDimensions(page) {
  // 在浏览器环境中执行代码，获取body的尺寸信息
  const bodyDimensions = await page.evaluate(() => {
    const body = document.body;
    const style = window.getComputedStyle(body);  // 获取计算后的样式

    return {
      width: parseFloat(style.width),           // body的宽度（像素）
      height: parseFloat(style.height),         // body的高度（像素）
      scrollWidth: body.scrollWidth,            // 内容的实际宽度（包括溢出部分）
      scrollHeight: body.scrollHeight           // 内容的实际高度（包括溢出部分）
    };
  });

  const errors = [];
  
  // 计算溢出量（像素）
  // 减1是为了容错，避免因为像素舍入导致的微小差异
  const widthOverflowPx = Math.max(0, bodyDimensions.scrollWidth - bodyDimensions.width - 1);
  const heightOverflowPx = Math.max(0, bodyDimensions.scrollHeight - bodyDimensions.height - 1);

  // 转换为点（Point）单位，因为PowerPoint使用点作为单位
  const widthOverflowPt = widthOverflowPx * PT_PER_PX;
  const heightOverflowPt = heightOverflowPx * PT_PER_PX;

  // 如果有溢出，记录错误信息
  if (widthOverflowPt > 0 || heightOverflowPt > 0) {
    const directions = [];
    if (widthOverflowPt > 0) directions.push(`${widthOverflowPt.toFixed(1)}pt horizontally`);
    if (heightOverflowPt > 0) directions.push(`${heightOverflowPt.toFixed(1)}pt vertically`);
    
    // 特别提醒：底部需要留出0.5英寸的边距
    const reminder = heightOverflowPt > 0 ? ' (Remember: leave 0.5" margin at bottom of slide)' : '';
    errors.push(`HTML content overflows body by ${directions.join(' and ')}${reminder}`);
  }

  return { ...bodyDimensions, errors };
}

/**
 * 辅助函数：验证HTML尺寸是否与演示文稿布局匹配
 * 
 * 功能：
 *   检查HTML body的尺寸是否与PowerPoint演示文稿的布局尺寸一致
 *   如果不一致，转换后的内容可能会出现位置偏移或缩放问题
 * 
 * @param {Object} bodyDimensions - body的尺寸信息（从getBodyDimensions获取）
 * @param {Object} pres - PptxGenJS演示文稿对象
 * @returns {Array} 错误信息数组，如果没有错误则返回空数组
 */
function validateDimensions(bodyDimensions, pres) {
  const errors = [];
  
  // 将像素转换为英寸
  const widthInches = bodyDimensions.width / PX_PER_IN;
  const heightInches = bodyDimensions.height / PX_PER_IN;

  // 如果演示文稿定义了布局
  if (pres.presLayout) {
    // 将EMU单位转换为英寸（PowerPoint内部使用EMU）
    const layoutWidth = pres.presLayout.width / EMU_PER_IN;
    const layoutHeight = pres.presLayout.height / EMU_PER_IN;

    // 允许0.1英寸的误差（容错范围）
    // 如果差异超过0.1英寸，认为不匹配
    if (Math.abs(layoutWidth - widthInches) > 0.1 || Math.abs(layoutHeight - heightInches) > 0.1) {
      errors.push(
        `HTML dimensions (${widthInches.toFixed(1)}" × ${heightInches.toFixed(1)}") ` +
        `don't match presentation layout (${layoutWidth.toFixed(1)}" × ${layoutHeight.toFixed(1)}")`
      );
    }
  }
  return errors;
}

/**
 * 验证文本框位置：确保文本距离底部有足够的边距
 * 
 * 功能：
 *   检查所有文本元素（段落、标题、列表）是否距离幻灯片底部太近
 *   PowerPoint要求文本内容距离底部至少0.5英寸，否则转换可能失败
 * 
 * 为什么需要这个验证？
 *   - html2pptx转换过程中，如果文本太靠近底部，可能会被截断
 *   - 0.5英寸是PowerPoint的安全边距要求
 * 
 * @param {Object} slideData - 提取的幻灯片数据
 * @param {Object} bodyDimensions - body的尺寸信息
 * @returns {Array} 错误信息数组
 */
function validateTextBoxPosition(slideData, bodyDimensions) {
  const errors = [];
  const slideHeightInches = bodyDimensions.height / PX_PER_IN;  // 幻灯片高度（英寸）
  const minBottomMargin = 0.5;  // 最小底部边距：0.5英寸

  // 遍历所有元素
  for (const el of slideData.elements) {
    // 只检查文本元素（段落、标题、列表）
    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'list'].includes(el.type)) {
      const fontSize = el.style?.fontSize || 0;
      const bottomEdge = el.position.y + el.position.h;  // 文本框底部边缘位置
      const distanceFromBottom = slideHeightInches - bottomEdge;  // 距离底部的距离

      // 只检查字体大小大于12pt的文本（小字体可能不需要严格检查）
      if (fontSize > 12 && distanceFromBottom < minBottomMargin) {
        // 提取文本内容用于错误提示（只取前50个字符）
        const getText = () => {
          if (typeof el.text === 'string') return el.text;
          if (Array.isArray(el.text)) return el.text.find(t => t.text)?.text || '';
          if (Array.isArray(el.items)) return el.items.find(item => item.text)?.text || '';
          return '';
        };
        const textPrefix = getText().substring(0, 50) + (getText().length > 50 ? '...' : '');

        errors.push(
          `Text box "${textPrefix}" ends too close to bottom edge ` +
          `(${distanceFromBottom.toFixed(2)}" from bottom, minimum ${minBottomMargin}" required)`
        );
      }
    }
  }

  return errors;
}

/**
 * 辅助函数：为幻灯片添加背景
 * 
 * 功能：
 *   根据提取的背景数据，为PowerPoint幻灯片设置背景
 *   支持两种背景类型：
 *   1. 图片背景：从HTML的background-image提取
 *   2. 纯色背景：从HTML的background-color提取
 * 
 * @param {Object} slideData - 提取的幻灯片数据（包含background信息）
 * @param {Object} targetSlide - 目标幻灯片对象（PptxGenJS）
 * @param {string} tmpDir - 临时目录路径（未使用，可能是预留）
 */
async function addBackground(slideData, targetSlide, tmpDir) {
  // 处理图片背景
  if (slideData.background.type === 'image' && slideData.background.path) {
    // 移除file://协议前缀（如果有）
    let imagePath = slideData.background.path.startsWith('file://')
      ? slideData.background.path.replace('file://', '')
      : slideData.background.path;
    
    // 检查图片文件是否存在（仅检查本地文件路径）
    const isLocalPath = !imagePath.startsWith('http://') && !imagePath.startsWith('https://') && !imagePath.startsWith('data:');
    if (isLocalPath && !fs.existsSync(imagePath)) {
      logger.error(`⚠️  背景图片文件不存在，跳过: ${imagePath}`);
    } else {
      targetSlide.background = { path: imagePath };
    }
  } 
  // 处理纯色背景
  else if (slideData.background.type === 'color' && slideData.background.value) {
    targetSlide.background = { color: slideData.background.value };
  }
}

/**
 * 辅助函数：将提取的元素添加到幻灯片
 * 
 * 重要：严格按照 DOM 顺序添加元素！
 *   - elements 数组已经按照 DOM 遍历顺序排列
 *   - 按数组顺序逐个添加，保持与 HTML 中相同的层叠关系
 *   - 先出现的元素在底层，后出现的元素在上层
 * 
 * @param {Object} slideData - 提取的幻灯片数据（包含elements数组）
 * @param {Object} targetSlide - 目标幻灯片对象
 * @param {Object} pres - PptxGenJS演示文稿对象（用于访问ShapeType等常量）
 */
function addElements(slideData, targetSlide, pres) {
  // 严格按照数组顺序（即 DOM 顺序）逐个添加元素
  for (const el of slideData.elements) {
    try {
      // ====================================================================
      // 处理形状（shape）
      // ====================================================================
      if (el.type === 'shape') {
        if (el.shape && (el.shape.fill || el.shape.line)) {
          const shapeOptions = {
            x: el.position.x,
            y: el.position.y,
            w: el.position.w,
            h: el.position.h,
            shape: el.shape.rectRadius > 0 ? pres.ShapeType.roundRect : pres.ShapeType.rect
          };

          if (el.shape.fill) {
            shapeOptions.fill = { color: el.shape.fill };
            if (el.shape.transparency != null) shapeOptions.fill.transparency = el.shape.transparency;
          }
          if (el.shape.line) shapeOptions.line = el.shape.line;
          if (el.shape.rectRadius > 0) shapeOptions.rectRadius = el.shape.rectRadius;
          if (el.shape.shadow) shapeOptions.shadow = el.shape.shadow;
          if (el.rotate) shapeOptions.rotate = el.rotate;

          targetSlide.addShape(shapeOptions.shape || pres.ShapeType.rect, shapeOptions);
        }
      }
      // ====================================================================
      // 处理图片（image）
      // ====================================================================
      else if (el.type === 'image') {
        let imagePath = el.src.startsWith('file://') ? el.src.replace('file://', '') : el.src;
        
        // 检查图片文件是否存在（仅检查本地文件路径，跳过 URL 和 data URI）
        const isLocalPath = !imagePath.startsWith('http://') && !imagePath.startsWith('https://') && !imagePath.startsWith('data:');
        if (isLocalPath && !fs.existsSync(imagePath)) {
          logger.error(`⚠️  图片文件不存在，跳过: ${imagePath}`);
          continue;
        }
        
        const imageOptions = {
          path: imagePath,
          x: el.position.x,
          y: el.position.y,
          w: el.position.w,
          h: el.position.h
        };
        if (el.transparency != null) {
          imageOptions.transparency = el.transparency;
        }
        try {
          targetSlide.addImage(imageOptions);
        } catch (imgError) {
          logger.error(`⚠️  图片添加失败，跳过: ${imagePath}, 原因: ${imgError.message}`);
        }
      }
      // ====================================================================
      // 处理线条（line）
      // ====================================================================
      else if (el.type === 'line') {
        targetSlide.addShape(pres.ShapeType.line, {
          x: el.x1,
          y: el.y1,
          w: el.x2 - el.x1,
          h: el.y2 - el.y1,
          line: { 
            color: el.color,
            width: el.width
          }
        });
      }
      // ====================================================================
      // 处理列表（list）
      // ====================================================================
      else if (el.type === 'list') {
        const listOptions = {
          x: el.position.x,
          y: el.position.y,
          w: el.position.w,
          h: el.position.h,
          fontSize: el.style.fontSize,
          fontFace: el.style.fontFace,
          color: el.style.color,
          align: el.style.align,
          valign: 'top',
          lineSpacing: el.style.lineSpacing,
          paraSpaceBefore: el.style.paraSpaceBefore,
          paraSpaceAfter: el.style.paraSpaceAfter,
          margin: el.style.margin
        };
        if (el.style.margin) listOptions.margin = el.style.margin;
        if (el.style.charSpacing) listOptions.charSpacing = el.style.charSpacing;
        targetSlide.addText(el.items, listOptions);
      }
      // ====================================================================
      // 处理文本元素（p, h1-h6 等）
      // ====================================================================
      else {
        const lineHeight = el.style.lineSpacing || el.style.fontSize * 1.2;
        // position.h 是 inches，lineHeight 是 points (1 inch = 72 points)
        // 需要统一单位：将 position.h 转为 points 再比较
        const heightInPoints = el.position.h * 72;
        const isSingleLine = heightInPoints <= lineHeight * 1.5;

        let adjustedX = el.position.x;
        let adjustedW = el.position.w;

        if (isSingleLine) {
          const textContent = typeof el.text === 'string' ? el.text : 
                             (Array.isArray(el.text) ? el.text.map(r => r.text || '').join('') : '');
          const hasChinese = /[\u4e00-\u9fff]/.test(textContent);
          const textLen = textContent.length;
          // 短文本需要更大宽度增量，避免如 "89%" 等文本的末尾字符被挤到下一行
          const widthPercent = hasChinese
            ? (textLen <= 4 ? 0.20 : 0.10)
            : (textLen <= 6 ? 0.20 : (textLen <= 12 ? 0.10 : 0.05));
          const widthIncrease = el.position.w * widthPercent;
          const align = el.style.align;

          if (align === 'center') {
            adjustedX = el.position.x - (widthIncrease / 2);
            adjustedW = el.position.w + widthIncrease;
          } else if (align === 'right') {
            adjustedX = el.position.x - widthIncrease;
            adjustedW = el.position.w + widthIncrease;
          } else {
            adjustedW = el.position.w + widthIncrease;
          }
        }

        const textOptions = {
          x: adjustedX,
          y: el.position.y,
          w: adjustedW,
          h: el.position.h,
          fontSize: el.style.fontSize,
          fontFace: el.style.fontFace,
          color: el.style.color,
          bold: el.style.bold,
          italic: el.style.italic,
          underline: el.style.underline,
          valign: 'top',
          lineSpacing: el.style.lineSpacing,
          paraSpaceBefore: el.style.paraSpaceBefore,
          paraSpaceAfter: el.style.paraSpaceAfter,
          inset: 0
        };

        if (el.style.align) textOptions.align = el.style.align;
        if (el.style.margin) textOptions.margin = el.style.margin;
        if (el.style.rotate !== undefined) textOptions.rotate = el.style.rotate;
        if (el.style.vert) textOptions.vert = el.style.vert;
        if (el.style.charSpacing) textOptions.charSpacing = el.style.charSpacing;
        if (el.style.transparency !== null && el.style.transparency !== undefined) {
          textOptions.transparency = el.style.transparency;
        }

        const textToAdd = typeof el.text === 'string' ? el.text.trim() : el.text;
        if (textToAdd && (typeof textToAdd === 'string' ? textToAdd.length > 0 : true)) {
          if (textOptions.color && !/^[0-9A-F]{6}$/i.test(textOptions.color)) {
            logger.warn(`Invalid color format: ${textOptions.color}, using default black`);
            textOptions.color = '000000';
          }
          targetSlide.addText(textToAdd, textOptions);
        } else {
          logger.warn(`Skipping element type ${el.type}: empty text content`);
        }
      }
    } catch (err) {
      logger.error(`Error adding element type ${el.type}:`, err.message);
      logger.log(`Element details:`, {
        type: el.type,
        hasText: !!el.text,
        textType: typeof el.text,
        textLength: typeof el.text === 'string' ? el.text.length : 'N/A',
        position: el.position,
        color: el.style?.color
      });
    }
  }
}

/**
 * 核心函数：从HTML页面提取幻灯片数据
 * 
 * 这是整个转换过程的核心函数，功能包括：
 *   1. 在浏览器环境中执行（使用page.evaluate）
 *   2. 遍历DOM树，提取所有元素
 *   3. 解析CSS样式，转换为PowerPoint格式
 *   4. 计算元素位置和尺寸
 *   5. 处理文本格式化（粗体、斜体、颜色等）
 *   6. 提取背景、形状、图片、列表等
 * 
 * 为什么要在浏览器中执行？
 *   - 需要获取计算后的CSS样式（window.getComputedStyle）
 *   - 需要获取元素的实际渲染位置（getBoundingClientRect）
 *   - 这些信息在Node.js环境中无法直接获取
 * 
 * @param {Page} page - Playwright页面对象
 * @returns {Promise<Object>} 包含background、elements、placeholders、errors的对象
 */
async function extractSlideData(page) {
  // 在浏览器环境中执行代码（这个函数内的代码在浏览器中运行，不在Node.js中）
  return await page.evaluate(() => {
    // ========================================================================
    // 单位转换常量（在浏览器环境中重新定义）
    // ========================================================================
    const PT_PER_PX = 0.75;  // 点/像素
    const PX_PER_IN = 96;    // 像素/英寸

    // ========================================================================
    // 字体处理：单字重字体列表
    // ========================================================================
    // 某些字体（如Impact）只有一种字重，不应该应用粗体
    // 如果强制应用粗体，PowerPoint会使用"假粗体"（faux bold），导致文字变宽
    const SINGLE_WEIGHT_FONTS = ['impact'];

    /**
     * 检查字体是否应该跳过粗体格式化
     * @param {string} fontFamily - 字体名称
     * @returns {boolean} 如果应该跳过粗体，返回true
     */
    const shouldSkipBold = (fontFamily) => {
      if (!fontFamily) return false;
      // 规范化字体名称：转小写、移除引号、取第一个字体（字体列表用逗号分隔）
      const normalizedFont = fontFamily.toLowerCase().replace(/['"]/g, '').split(',')[0].trim();
      return SINGLE_WEIGHT_FONTS.includes(normalizedFont);
    };

    // ========================================================================
    // 单位转换辅助函数
    // ========================================================================
    
    /**
     * 像素转英寸
     * @param {number} px - 像素值
     * @returns {number} 英寸值
     */
    const pxToInch = (px) => px / PX_PER_IN;
    
    /**
     * 像素字符串转点（Point）
     * @param {string} pxStr - 像素字符串（如"16px"）
     * @returns {number} 点值
     */
    const pxToPoints = (pxStr) => parseFloat(pxStr) * PT_PER_PX;
    
    /**
     * RGB/RGBA颜色字符串转十六进制
     * @param {string} rgbStr - RGB颜色字符串（如"rgb(255, 0, 0)"或"rgba(255, 0, 0, 0.5)"）
     * @returns {string} 十六进制颜色（如"FF0000"）
     */
    const rgbToHex = (rgbStr) => {
      // 处理透明背景，默认为白色
      if (rgbStr === 'rgba(0, 0, 0, 0)' || rgbStr === 'transparent') return 'FFFFFF';

      // 匹配rgb或rgba格式：rgb(255, 0, 0) 或 rgba(255, 0, 0, 0.5)
      const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return 'FFFFFF';
      
      // 提取RGB三个值，转换为十六进制，补零，转大写
      // 例如：rgb(255, 0, 0) -> ["255", "0", "0"] -> ["FF", "00", "00"] -> "FF0000"
      return match.slice(1).map(n => parseInt(n).toString(16).padStart(2, '0')).join('').toUpperCase();
    };

    /**
     * 从RGBA字符串提取透明度（alpha通道）
     * @param {string} rgbStr - RGBA颜色字符串
     * @returns {number|null} 透明度值（0-100，0表示完全不透明），如果无法提取则返回null
     */
    const extractAlpha = (rgbStr) => {
      const match = rgbStr.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      if (!match || !match[4]) return null;
      const alpha = parseFloat(match[4]);  // alpha值范围：0-1
      // 转换为PowerPoint格式：0-100，0表示完全不透明，100表示完全透明
      return Math.round((1 - alpha) * 100);
    };

    /**
     * 应用CSS text-transform属性
     * @param {string} text - 原始文本
     * @param {string} textTransform - CSS text-transform值（uppercase/lowercase/capitalize/none）
     * @returns {string} 转换后的文本
     */
    const applyTextTransform = (text, textTransform) => {
      if (textTransform === 'uppercase') return text.toUpperCase();      // 全大写
      if (textTransform === 'lowercase') return text.toLowerCase();      // 全小写
      if (textTransform === 'capitalize') {
        // 首字母大写：匹配单词边界后的第一个字母
        return text.replace(/\b\w/g, c => c.toUpperCase());
      }
      return text;  // none或其他值，不转换
    };

    /**
     * 从CSS transform和writing-mode提取旋转角度和竖排文本方向
     * 
     * PowerPoint旋转角度说明：
     *   - 90°：文本顺时针旋转90度（从上到下阅读，字母保持直立）
     *   - 270°：文本顺时针旋转270度（从下到上阅读，字母保持直立）
     * 
     * PowerPoint竖排文本方向（vert）：
     *   - 'eaVert'：东亚竖排文本，每个字符保持直立，从上到下排列
     *     这是中文/日文/韩文竖排文字的正确方式
     *   - 'vert'：西文竖排，整行旋转90度
     * 
     * @param {string} transform - CSS transform值（如"rotate(45deg)"或"matrix(...)"）
     * @param {string} writingMode - CSS writing-mode值（如"vertical-rl"）
     * @returns {Object} { rotation: number|null, vert: string|null }
     */
    const getRotationAndVert = (transform, writingMode) => {
      let angle = 0;
      let vert = null;

      // 处理writing-mode（垂直文本方向）
      // 使用 PptxGenJS 的 vert 属性实现竖排，而非旋转
      if (writingMode === 'vertical-rl') {
        // vertical-rl：文本从上到下、从右到左阅读
        // 使用东亚竖排模式，每个字符保持直立
        vert = 'eaVert';
      } else if (writingMode === 'vertical-lr') {
        // vertical-lr：文本从上到下、从左到右阅读
        vert = 'eaVert';
      }

      // 处理transform中的旋转
      if (transform && transform !== 'none') {
        // 尝试匹配rotate()函数（如"rotate(45deg)"）
        const rotateMatch = transform.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/);
        if (rotateMatch) {
          angle += parseFloat(rotateMatch[1]);
        } else {
          // 浏览器可能将transform计算为matrix格式
          // 需要从matrix中提取旋转角度
          const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
          if (matrixMatch) {
            const values = matrixMatch[1].split(',').map(parseFloat);
            // CSS matrix格式：matrix(a, b, c, d, e, f)
            // 旋转角度 = atan2(b, a) * (180 / π)
            const matrixAngle = Math.atan2(values[1], values[0]) * (180 / Math.PI);
            angle += Math.round(matrixAngle);
          }
        }
      }

      // 规范化角度到0-359范围
      angle = angle % 360;
      if (angle < 0) angle += 360;

      return {
        rotation: angle === 0 ? null : angle,
        vert: vert
      };
    };

    /**
     * 获取元素的位置和尺寸，考虑旋转
     * 
     * 重要：PowerPoint和浏览器的旋转处理方式不同
     *   - 浏览器：先定义宽高，然后旋转（显示的是旋转后的尺寸）
     *   - PowerPoint：先定义宽高，然后旋转（需要的是旋转前的尺寸）
     * 
     * 对于90°和270°旋转：
     *   - 浏览器显示的是旋转后的尺寸（垂直文本显示为高>宽）
     *   - PowerPoint需要的是旋转前的尺寸（宽>高，然后旋转）
     *   - 所以需要交换宽高
     * 
     * @param {Element} el - DOM元素
     * @param {DOMRect} rect - 元素的边界矩形（getBoundingClientRect的结果）
     * @param {number|null} rotation - 旋转角度（0-359），null表示无旋转
     * @returns {Object} 包含x, y, w, h的对象（已考虑旋转）
     */
    const getPositionAndSize = (el, rect, rotation) => {
      // 如果没有旋转，直接返回rect的尺寸
      if (rotation === null) {
        return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
      }

      // 判断是否为垂直旋转（90°或270°）
      const isVertical = rotation === 90 || rotation === 270;

      if (isVertical) {
        // 垂直旋转：需要交换宽高
        // 浏览器显示的是旋转后的尺寸（高>宽）
        // PowerPoint需要的是旋转前的尺寸（宽>高，然后旋转）
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        return {
          x: centerX - rect.height / 2,  // 使用高度作为宽度
          y: centerY - rect.width / 2,    // 使用宽度作为高度
          w: rect.height,                 // 交换：浏览器的高度 = PowerPoint的宽度
          h: rect.width                   // 交换：浏览器的宽度 = PowerPoint的高度
        };
      }

      // 其他旋转角度：使用元素的offset尺寸（原始尺寸，未考虑旋转）
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return {
        x: centerX - el.offsetWidth / 2,
        y: centerY - el.offsetHeight / 2,
        w: el.offsetWidth,
        h: el.offsetHeight
      };
    };

    /**
     * 解析CSS box-shadow属性，转换为PptxGenJS阴影格式
     * 
     * CSS box-shadow格式：
     *   box-shadow: offsetX offsetY blur spread color [inset];
     *   例如：box-shadow: 2px 2px 8px 0px rgba(0, 0, 0, 0.3);
     * 
     * 浏览器计算后的格式可能不同：
     *   "rgba(0, 0, 0, 0.3) 2px 2px 8px 0px [inset]"
     * 
     * 重要限制：
     *   - PptxGenJS/PowerPoint不支持内阴影（inset shadows）
     *   - 如果检测到inset，返回null，避免文件损坏
     * 
     * @param {string} boxShadow - CSS box-shadow值
     * @returns {Object|null} PptxGenJS阴影对象，如果无法解析或为内阴影则返回null
     */
    const parseBoxShadow = (boxShadow) => {
      if (!boxShadow || boxShadow === 'none') return null;

      // 检查是否为内阴影（inset）
      const insetMatch = boxShadow.match(/inset/);

      // 重要：PptxGenJS/PowerPoint不支持内阴影
      // 只处理外阴影，避免文件损坏
      if (insetMatch) return null;

      // 提取颜色（rgba或rgb）
      const colorMatch = boxShadow.match(/rgba?\([^)]+\)/);

      // 提取数值部分（支持px和pt单位）
      // 匹配格式：数字+单位（如"2px"、"8pt"）
      const parts = boxShadow.match(/([-\d.]+)(px|pt)/g);

      if (!parts || parts.length < 2) return null;

      const offsetX = parseFloat(parts[0]);  // X偏移
      const offsetY = parseFloat(parts[1]); // Y偏移
      const blur = parts.length > 2 ? parseFloat(parts[2]) : 0;  // 模糊半径

      // 从偏移量计算角度（度，0°=右，90°=下）
      let angle = 0;
      if (offsetX !== 0 || offsetY !== 0) {
        angle = Math.atan2(offsetY, offsetX) * (180 / Math.PI);
        if (angle < 0) angle += 360;  // 规范化到0-360
      }

      // 计算偏移距离（斜边长度，勾股定理）
      const offset = Math.sqrt(offsetX * offsetX + offsetY * offsetY) * PT_PER_PX;

      // 从rgba中提取透明度
      let opacity = 0.5;  // 默认透明度
      if (colorMatch) {
        const opacityMatch = colorMatch[0].match(/[\d.]+\)$/);
        if (opacityMatch) {
          opacity = parseFloat(opacityMatch[0].replace(')', ''));
        }
      }

      // 返回PptxGenJS阴影格式
      return {
        type: 'outer',                    // 外阴影
        angle: Math.round(angle),         // 角度（度）
        blur: blur * 0.75,                // 模糊半径（转换为点）
        color: colorMatch ? rgbToHex(colorMatch[0]) : '000000',  // 颜色（十六进制）
        offset: offset,                   // 偏移距离（点）
        opacity                           // 透明度（0-1）
      };
    };

    // ========================================================================
    // 警告收集器（必须在parseInlineFormatting之前定义，因为它会被使用）
    // 注意：这里收集的是警告而非错误，不会导致转换失败
    // ========================================================================
    const warnings = [];
    const errors = []; // 保留errors数组用于严重错误（如尺寸不匹配）

    /**
     * 解析内联格式化标签，转换为文本运行（text runs）
     * 
     * 功能：
     *   将HTML中的内联格式化标签（<b>、<i>、<u>、<strong>、<em>、<span>）
     *   转换为PowerPoint的文本运行数组
     * 
     * PowerPoint文本运行：
     *   一个文本运行（text run）是一段具有相同格式的文本
     *   例如："这是<b>粗体</b>文本"会被转换为两个运行：
     *     [{text: "这是", options: {}}, {text: "粗体", options: {bold: true}}, {text: "文本", options: {}}]
     * 
     * @param {Element} element - DOM元素
     * @param {Object} baseOptions - 基础格式选项（会被子元素继承）
     * @param {Array} runs - 文本运行数组（累积结果）
     * @param {Function} baseTextTransform - 基础文本转换函数
     * @returns {Array} 文本运行数组
     */
    const parseInlineFormatting = (element, baseOptions = {}, runs = [], baseTextTransform = (x) => x) => {
      let prevNodeIsText = false;  // 跟踪上一个节点是否为文本节点（用于合并连续的文本）
      
      // 检查父元素是否为 PRE 或 CODE（需要保留空白字符）
      const isPreOrCode = element.tagName === 'PRE' || element.tagName === 'CODE' || 
                          element.closest('PRE') || element.closest('CODE');

      // 遍历元素的所有子节点
      element.childNodes.forEach((node) => {
        let textTransform = baseTextTransform;  // 文本转换函数

        // 判断是否为文本节点或换行符
        const isText = node.nodeType === Node.TEXT_NODE || node.tagName === 'BR';
        
        if (isText) {
          // 处理文本节点
          // <br>标签转换为换行符
          if (node.tagName === 'BR') {
            const prevRun = runs[runs.length - 1];
            if (prevNodeIsText && prevRun) {
              prevRun.text += '\n';
            } else {
              runs.push({ text: '\n', options: { ...baseOptions } });
            }
          } else {
            // 对于 PRE 和 CODE 标签内的文本，保留原始格式（包括空白字符和换行）
            // 对于其他文本，规范化空白字符
            const rawText = node.textContent;
            const text = isPreOrCode ? textTransform(rawText) : textTransform(rawText.replace(/\s+/g, ' '));
            const prevRun = runs[runs.length - 1];
            
            // 如果上一个节点也是文本节点，合并到同一个运行中（避免创建过多运行）
            if (prevNodeIsText && prevRun) {
              prevRun.text += text;
            } else {
              // 创建新的文本运行
              runs.push({ text, options: { ...baseOptions } });
            }
          }

        } 
        // 处理元素节点（内联格式化标签）
        else if (node.nodeType === Node.ELEMENT_NODE && node.textContent.trim()) {
          const options = { ...baseOptions };  // 继承基础选项
          const computed = window.getComputedStyle(node);  // 获取计算后的样式

          // 处理 PRE 和 CODE 标签
          if (node.tagName === 'PRE' || node.tagName === 'CODE') {
            // 对于 PRE 和 CODE，确保使用等宽字体（如果未设置）
            if (!computed.fontFamily || !computed.fontFamily.includes('monospace') && 
                !computed.fontFamily.includes('Courier')) {
              options.fontFace = 'Courier New';
            } else {
              options.fontFace = computed.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
            }
            
            // 处理字体大小（如果与父元素不同）
            if (computed.fontSize) options.fontSize = pxToPoints(computed.fontSize);
            
            // 处理颜色（如果不是默认黑色）
            if (computed.color && computed.color !== 'rgb(0, 0, 0)') {
              options.color = rgbToHex(computed.color);
              const transparency = extractAlpha(computed.color);
              if (transparency !== null) options.transparency = transparency;
            }
            
            // 递归处理子节点，保留空白字符
            parseInlineFormatting(node, options, runs, baseTextTransform);
          }
          // 处理内联元素（SPAN、B、STRONG、I、EM、U）
          else if (node.tagName === 'SPAN' || node.tagName === 'B' || node.tagName === 'STRONG' || 
              node.tagName === 'I' || node.tagName === 'EM' || node.tagName === 'U') {
            
            // 检查粗体：fontWeight为'bold'或数值>=600
            const isBold = computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 600;
            if (isBold && !shouldSkipBold(computed.fontFamily)) options.bold = true;
            
            // 检查斜体
            if (computed.fontStyle === 'italic') options.italic = true;
            
            // 检查下划线
            if (computed.textDecoration && computed.textDecoration.includes('underline')) {
              options.underline = true;
            }
            
            // 处理颜色（如果不是默认黑色）
            if (computed.color && computed.color !== 'rgb(0, 0, 0)') {
              options.color = rgbToHex(computed.color);
              const transparency = extractAlpha(computed.color);
              if (transparency !== null) options.transparency = transparency;
            }
            
            // 处理字体大小（如果与父元素不同）
            if (computed.fontSize) options.fontSize = pxToPoints(computed.fontSize);

            // 应用text-transform（如果元素本身设置了）
            if (computed.textTransform && computed.textTransform !== 'none') {
              const transformStr = computed.textTransform;
              textTransform = (text) => applyTextTransform(text, transformStr);
            }

            // 验证：检查内联元素是否有margin（PowerPoint不支持）- 改为警告
            if (computed.marginLeft && parseFloat(computed.marginLeft) > 0) {
              warnings.push(`Inline element <${node.tagName.toLowerCase()}> has margin-left which is not supported in PowerPoint.`);
            }
            if (computed.marginRight && parseFloat(computed.marginRight) > 0) {
              warnings.push(`Inline element <${node.tagName.toLowerCase()}> has margin-right which is not supported in PowerPoint.`);
            }
            if (computed.marginTop && parseFloat(computed.marginTop) > 0) {
              warnings.push(`Inline element <${node.tagName.toLowerCase()}> has margin-top which is not supported in PowerPoint.`);
            }
            if (computed.marginBottom && parseFloat(computed.marginBottom) > 0) {
              warnings.push(`Inline element <${node.tagName.toLowerCase()}> has margin-bottom which is not supported in PowerPoint.`);
            }

            // 递归处理子节点（这会扁平化嵌套的span，转换为多个运行）
            parseInlineFormatting(node, options, runs, textTransform);
          }
        }

        prevNodeIsText = isText;  // 更新上一个节点的类型
      });

      // 清理：移除第一个运行的前导空格和最后一个运行的后缀空格
      // 这样可以避免格式化标签之间的空格被保留
      // 但对于 PRE 和 CODE 标签，保留所有空白字符
      if (runs.length > 0 && !isPreOrCode) {
        runs[0].text = runs[0].text.replace(/^\s+/, '');
        runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
      }

      // 过滤掉空文本的运行
      return runs.filter(r => r.text.length > 0);
    };

    // ========================================================================
    // 提取背景（从body元素）
    // ========================================================================
    const body = document.body;
    const bodyStyle = window.getComputedStyle(body);
    const bgImage = bodyStyle.backgroundImage;  // 背景图片
    const bgColor = bodyStyle.backgroundColor;  // 背景颜色

    // 验证：检查CSS渐变（不支持）- 改为警告，使用背景色代替
    if (bgImage && (bgImage.includes('linear-gradient') || bgImage.includes('radial-gradient'))) {
      warnings.push(
        'CSS gradients are not supported, using background color instead.'
      );
    }

    let background;
    // 如果有背景图片
    if (bgImage && bgImage !== 'none') {
      // 从url()中提取URL（支持url("...")或url(...)格式）
      const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (urlMatch) {
        background = {
          type: 'image',
          path: urlMatch[1]  // 图片路径
        };
      } else {
        // 如果无法提取URL，使用背景颜色
        background = {
          type: 'color',
          value: rgbToHex(bgColor)
        };
      }
    } else {
      // 没有背景图片，使用背景颜色
      background = {
        type: 'color',
        value: rgbToHex(bgColor)
      };
    }

    // ========================================================================
    // 处理所有元素：遍历DOM树，提取元素信息
    // ========================================================================
    const elements = [];        // 提取的元素数组
    const placeholders = [];    // 占位符数组（用于后续添加图表等）
    const textTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'PRE', 'CODE', 'SPAN'];  // 文本标签列表
    const processed = new Set();  // 已处理的元素集合（避免重复处理）

    // SVG 全局索引计数器（用于与 convertSvgToPng 中的索引对应）
    let svgGlobalIndex = 0;

    // 渐变 div 全局索引计数器（用于与 convertGradientDivsToPng 中的索引对应）
    let gradientGlobalIndex = 0;

    // 遍历所有元素（使用querySelectorAll('*')获取所有元素）
    document.querySelectorAll('*').forEach((el) => {
      // 如果已经处理过，跳过（避免重复处理）
      if (processed.has(el)) return;

      // ====================================================================
      // 处理 SVG 元素：插入占位符，保持 DOM 顺序
      // SVG 元素无法在浏览器环境中直接转为 PNG，需要在 Node.js 侧处理
      // 这里只记录占位符，后续由 convertSvgToPng 替换为真实图片数据
      // ====================================================================
      if (el.tagName === 'svg' || el.tagName === 'SVG') {
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);
        if (rect.width > 0 && rect.height > 0 && computed.display !== 'none') {
          elements.push({
            type: 'svg_placeholder',
            svgIndex: svgGlobalIndex,
            position: {
              x: rect.left / 96,
              y: rect.top / 96,
              w: rect.width / 96,
              h: rect.height / 96
            }
          });
        }
        svgGlobalIndex++;
        // 标记 SVG 及其所有子元素为已处理
        processed.add(el);
        el.querySelectorAll('*').forEach(child => processed.add(child));
        return;
      }

      // Validate text elements don't have backgrounds, borders, or shadows
      // Note: We check the element's own style, not inherited styles
      if (textTags.includes(el.tagName)) {
        const computed = window.getComputedStyle(el);
        // Check if background is explicitly set on this element (not inherited)
        const bgColor = computed.backgroundColor;
        const hasBg = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent' && 
                      computed.backgroundImage !== 'none';
        // Check if border is explicitly set (not from parent)
        const hasBorder = (computed.borderWidth && parseFloat(computed.borderWidth) > 0) ||
                          (computed.borderTopWidth && parseFloat(computed.borderTopWidth) > 0) ||
                          (computed.borderRightWidth && parseFloat(computed.borderRightWidth) > 0) ||
                          (computed.borderBottomWidth && parseFloat(computed.borderBottomWidth) > 0) ||
                          (computed.borderLeftWidth && parseFloat(computed.borderLeftWidth) > 0);
        const hasShadow = computed.boxShadow && computed.boxShadow !== 'none';

        // Only skip if the element itself has these styles (not inherited from parent)
        // Check if background is actually set on this element vs inherited
        const style = el.style;
        const hasExplicitBg = style.backgroundColor || style.backgroundImage;
        const hasExplicitBorder = style.borderWidth || style.borderTopWidth || style.borderRightWidth || 
                                  style.borderBottomWidth || style.borderLeftWidth;
        const hasExplicitShadow = style.boxShadow;

        if ((hasBg && hasExplicitBg) || (hasBorder && hasExplicitBorder) || (hasShadow && hasExplicitShadow)) {
          // 改为警告，继续处理元素（忽略背景/边框/阴影）
          warnings.push(
            `Text element <${el.tagName.toLowerCase()}> has ${hasBg && hasExplicitBg ? 'background' : hasBorder && hasExplicitBorder ? 'border' : 'shadow'} which will be ignored.`
          );
          // 不再return，继续处理文本内容
        }
      }

      // Extract placeholder elements (for charts, etc.)
      // 注意：el.className 对于 SVG 元素是 SVGAnimatedString，不能直接用 includes
      const classNameStr = typeof el.className === 'string' ? el.className : 
                          (el.className && el.className.baseVal ? el.className.baseVal : '');
      if (classNameStr && classNameStr.includes('placeholder')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          warnings.push(
            `Placeholder "${el.id || 'unnamed'}" has ${rect.width === 0 ? 'width: 0' : 'height: 0'}, skipping.`
          );
        } else {
          placeholders.push({
            id: el.id || `placeholder-${placeholders.length}`,
            x: pxToInch(rect.left),
            y: pxToInch(rect.top),
            w: pxToInch(rect.width),
            h: pxToInch(rect.height)
          });
        }
        processed.add(el);
        return;
      }

      // Extract images
      if (el.tagName === 'IMG') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const computed = window.getComputedStyle(el);
          // 提取 opacity（CSS opacity 范围 0-1，PptxGenJS transparency 范围 0-100）
          const opacity = parseFloat(computed.opacity);
          // 转换为 transparency：opacity 1 = transparency 0，opacity 0 = transparency 100
          const transparency = opacity < 1 ? Math.round((1 - opacity) * 100) : null;
          
          // 处理 object-fit: contain/cover 的情况
          // 当使用 object-fit 时，图片的实际显示尺寸和元素的边界框尺寸不同
          const objectFit = computed.objectFit;
          let imgX = rect.left;
          let imgY = rect.top;
          let imgW = rect.width;
          let imgH = rect.height;
          let needsScreenshot = false;  // 是否需要截图（用于 cover 模式）
          
          if (objectFit === 'contain' || objectFit === 'cover') {
            // 获取图片的原始尺寸
            const naturalW = el.naturalWidth;
            const naturalH = el.naturalHeight;
            
            if (naturalW > 0 && naturalH > 0) {
              const containerW = rect.width;
              const containerH = rect.height;
              const containerRatio = containerW / containerH;
              const imageRatio = naturalW / naturalH;
              
              if (objectFit === 'contain') {
                // contain：图片完整显示在容器内，可能有空白
                if (imageRatio > containerRatio) {
                  // 图片更宽：宽度撑满，高度按比例缩小
                  imgW = containerW;
                  imgH = containerW / imageRatio;
                  imgX = rect.left;
                  imgY = rect.top + (containerH - imgH) / 2;  // 垂直居中
                } else {
                  // 图片更高：高度撑满，宽度按比例缩小
                  imgH = containerH;
                  imgW = containerH * imageRatio;
                  imgX = rect.left + (containerW - imgW) / 2;  // 水平居中
                  imgY = rect.top;
                }
              } else if (objectFit === 'cover') {
                // cover：图片覆盖整个容器，会被裁剪
                // PowerPoint 不直接支持裁剪，需要通过截图来实现
                // 标记需要截图，保持容器尺寸
                needsScreenshot = true;
                imgX = rect.left;
                imgY = rect.top;
                imgW = containerW;
                imgH = containerH;
              }
            }
          }
          
          const imageData = {
            type: 'image',
            src: el.src,
            position: {
              x: pxToInch(imgX),
              y: pxToInch(imgY),
              w: pxToInch(imgW),
              h: pxToInch(imgH)
            },
            needsScreenshot: needsScreenshot  // 标记是否需要截图
          };
          
          // 只有当透明度不是完全不透明时才添加
          if (transparency !== null) {
            imageData.transparency = transparency;
          }
          
          elements.push(imageData);
          processed.add(el);
          return;
        }
      }

      // Extract DIVs with backgrounds/borders as shapes
      const isContainer = el.tagName === 'DIV' && !textTags.includes(el.tagName);
      if (isContainer) {
        const computed = window.getComputedStyle(el);
        const hasBg = computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)';

        // Validate: Check for unwrapped text content in DIV - 改为警告
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text) {
              warnings.push(
                `DIV contains unwrapped text "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}" which will be ignored.`
              );
            }
          }
        }

        // Check for background images on shapes - 改为警告，跳过背景图片但继续处理
        const bgImage = computed.backgroundImage;
        if (bgImage && bgImage !== 'none') {
          // 检查是否是渐变
          if (bgImage.includes('linear-gradient') || bgImage.includes('radial-gradient')) {
            // 渐变 div：插入占位符，后续由 convertGradientDivsToPng 截图替换
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              elements.push({
                type: 'gradient_placeholder',
                gradientIndex: gradientGlobalIndex,
                position: {
                  x: rect.left / 96,
                  y: rect.top / 96,
                  w: rect.width / 96,
                  h: rect.height / 96
                }
              });
              gradientGlobalIndex++;
              // 标记该元素已处理（渐变 div 作为图片处理，不需要再作为 shape 处理）
              processed.add(el);
              return;
            }
          } else {
            warnings.push('DIV has background-image which will be ignored.');
          }
          // 不再return，继续处理其他样式（如背景色、边框）
        }

        // Check for borders - both uniform and partial
        const borderTop = computed.borderTopWidth;
        const borderRight = computed.borderRightWidth;
        const borderBottom = computed.borderBottomWidth;
        const borderLeft = computed.borderLeftWidth;
        const borders = [borderTop, borderRight, borderBottom, borderLeft].map(b => parseFloat(b) || 0);
        const hasBorder = borders.some(b => b > 0);
        const hasUniformBorder = hasBorder && borders.every(b => b === borders[0]);
        const borderLines = [];

        if (hasBorder && !hasUniformBorder) {
          const rect = el.getBoundingClientRect();
          const x = pxToInch(rect.left);
          const y = pxToInch(rect.top);
          const w = pxToInch(rect.width);
          const h = pxToInch(rect.height);

          // Collect lines to add after shape (inset by half the line width to center on edge)
          if (parseFloat(borderTop) > 0) {
            const widthPt = pxToPoints(borderTop);
            const inset = (widthPt / 72) / 2; // Convert points to inches, then half
            borderLines.push({
              type: 'line',
              x1: x, y1: y + inset, x2: x + w, y2: y + inset,
              width: widthPt,
              color: rgbToHex(computed.borderTopColor)
            });
          }
          if (parseFloat(borderRight) > 0) {
            const widthPt = pxToPoints(borderRight);
            const inset = (widthPt / 72) / 2;
            borderLines.push({
              type: 'line',
              x1: x + w - inset, y1: y, x2: x + w - inset, y2: y + h,
              width: widthPt,
              color: rgbToHex(computed.borderRightColor)
            });
          }
          if (parseFloat(borderBottom) > 0) {
            const widthPt = pxToPoints(borderBottom);
            const inset = (widthPt / 72) / 2;
            borderLines.push({
              type: 'line',
              x1: x, y1: y + h - inset, x2: x + w, y2: y + h - inset,
              width: widthPt,
              color: rgbToHex(computed.borderBottomColor)
            });
          }
          if (parseFloat(borderLeft) > 0) {
            const widthPt = pxToPoints(borderLeft);
            const inset = (widthPt / 72) / 2;
            borderLines.push({
              type: 'line',
              x1: x + inset, y1: y, x2: x + inset, y2: y + h,
              width: widthPt,
              color: rgbToHex(computed.borderLeftColor)
            });
          }
        }

        if (hasBg || hasBorder) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const shadow = parseBoxShadow(computed.boxShadow);
            const { rotation } = getRotationAndVert(computed.transform, computed.writingMode);
            const { x, y, w, h } = getPositionAndSize(el, rect, rotation);

            // Only add shape if there's background or uniform border
            if (hasBg || hasUniformBorder) {
              elements.push({
                type: 'shape',
                text: '',  // Shape only - child text elements render on top
                position: {
                  x: pxToInch(x),
                  y: pxToInch(y),
                  w: pxToInch(w),
                  h: pxToInch(h)
                },
                rotate: rotation,
                shape: {
                  fill: hasBg ? rgbToHex(computed.backgroundColor) : null,
                  transparency: hasBg ? extractAlpha(computed.backgroundColor) : null,
                  line: hasUniformBorder ? {
                    color: rgbToHex(computed.borderColor),
                    width: pxToPoints(computed.borderWidth)
                  } : null,
                  // Convert border-radius to rectRadius (in inches)
                  // % values: 50%+ = circle (1), <50% = percentage of min dimension
                  // pt values: divide by 72 (72pt = 1 inch)
                  // px values: divide by 96 (96px = 1 inch)
                  rectRadius: (() => {
                    const radius = computed.borderRadius;
                    const radiusValue = parseFloat(radius);
                    if (radiusValue === 0) return 0;

                    if (radius.includes('%')) {
                      if (radiusValue >= 50) return 1;
                      // Calculate percentage of smaller dimension
                      const minDim = Math.min(rect.width, rect.height);
                      return (radiusValue / 100) * pxToInch(minDim);
                    }

                    if (radius.includes('pt')) return radiusValue / 72;
                    return radiusValue / PX_PER_IN;
                  })(),
                  shadow: shadow
                }
              });
            }

            // Add partial border lines
            elements.push(...borderLines);

            processed.add(el);
            return;
          }
        }
      }

      // Extract bullet lists as single text block
      if (el.tagName === 'UL' || el.tagName === 'OL') {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const liElements = Array.from(el.querySelectorAll('li'));
        const items = [];
        const ulComputed = window.getComputedStyle(el);
        const ulPaddingLeftPt = pxToPoints(ulComputed.paddingLeft);

        // Split: margin-left for bullet position, indent for text position
        // margin-left + indent = ul padding-left
        const marginLeft = ulPaddingLeftPt * 0.5;
        const textIndent = ulPaddingLeftPt * 0.5;

        liElements.forEach((li, idx) => {
          const isLast = idx === liElements.length - 1;
          const runs = parseInlineFormatting(li, { breakLine: false });
          // Clean manual bullets from first run
          if (runs.length > 0) {
            runs[0].text = runs[0].text.replace(/^[•\-\*▪▸]\s*/, '');
            runs[0].options.bullet = { indent: textIndent };
          }
          // Set breakLine on last run
          if (runs.length > 0 && !isLast) {
            runs[runs.length - 1].options.breakLine = true;
          }
          items.push(...runs);
        });

        const computed = window.getComputedStyle(liElements[0] || el);

        elements.push({
          type: 'list',
          items: items,
          position: {
            x: pxToInch(rect.left),
            y: pxToInch(rect.top),
            w: pxToInch(rect.width),
            h: pxToInch(rect.height)
          },
          style: {
            fontSize: pxToPoints(computed.fontSize),
            fontFace: computed.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
            color: rgbToHex(computed.color),
            transparency: extractAlpha(computed.color),
            align: computed.textAlign === 'start' ? 'left' : computed.textAlign,
            lineSpacing: computed.lineHeight && computed.lineHeight !== 'normal' ? pxToPoints(computed.lineHeight) : null,
            paraSpaceBefore: 0,
            paraSpaceAfter: pxToPoints(computed.marginBottom),
            // PptxGenJS margin array is [left, right, bottom, top]
            margin: [marginLeft, 0, 0, 0],
            charSpacing: (() => {
              const ls = parseFloat(computed.letterSpacing);
              return (!isNaN(ls) && ls !== 0) ? ls * PT_PER_PX : null;
            })()
          }
        });

        // 将 UL/OL 及其所有子元素添加到 processed 集合，防止重复提取
        // 这包括 li 元素以及 li 中的 span、b、i 等内联元素
        liElements.forEach(li => {
          processed.add(li);
          // 标记 li 中的所有子元素为已处理
          li.querySelectorAll('*').forEach(child => processed.add(child));
        });
        processed.add(el);
        return;
      }

      // Extract text elements (P, H1, H2, etc.)
      if (!textTags.includes(el.tagName)) return;

      const rect = el.getBoundingClientRect();
      // 对于 PRE 和 CODE 标签，保留原始文本（包括前导和尾随空白）
      // 对于其他标签：
      //   1. 使用 trim() 移除前后空白
      //   2. 将中间的连续空白字符（包括换行符）规范化为单个空格
      //   这样可以匹配浏览器的渲染行为（HTML 中的换行在浏览器中显示为空格）
      const isPreOrCode = el.tagName === 'PRE' || el.tagName === 'CODE';
      const text = isPreOrCode ? el.textContent : el.textContent.replace(/\s+/g, ' ').trim();
      if (rect.width === 0 || rect.height === 0 || !text) return;

      // Validate: Check for manual bullet symbols in text elements (not in lists) - 改为警告，自动移除bullet
      if (el.tagName !== 'LI' && /^[•\-\*▪▸○●◆◇■□]\s/.test(text.trimStart())) {
        warnings.push(
          `Text element <${el.tagName.toLowerCase()}> starts with bullet symbol, will be removed.`
        );
        // 不再return，继续处理（bullet符号会在后面被移除）
      }

      const computed = window.getComputedStyle(el);
      let { rotation, vert } = getRotationAndVert(computed.transform, computed.writingMode);

      // 如果元素自身没有旋转，检查祖先元素是否有 transform 旋转
      // CSS transform 不会继承，但在浏览器渲染中子元素会跟着父元素旋转
      // 需要手动向上查找累加祖先的旋转角度
      if (rotation === null) {
        let ancestor = el.parentElement;
        while (ancestor && ancestor !== document.body) {
          const ancestorComputed = window.getComputedStyle(ancestor);
          const ancestorResult = getRotationAndVert(ancestorComputed.transform, null);
          if (ancestorResult.rotation !== null) {
            rotation = (rotation || 0) + ancestorResult.rotation;
          }
          ancestor = ancestor.parentElement;
        }
        // 规范化角度
        if (rotation !== null) {
          rotation = rotation % 360;
          if (rotation < 0) rotation += 360;
          if (rotation === 0) rotation = null;
        }
      }

      const { x, y, w, h } = getPositionAndSize(el, rect, rotation);

      // 对于 PRE 和 CODE 标签，确保使用等宽字体（如果未设置）
      let fontFace = computed.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      if (isPreOrCode && !fontFace.includes('monospace') && !fontFace.includes('Courier')) {
        fontFace = 'Courier New';
      }
      
      // 提取 letter-spacing（字符间距）
      // CSS letter-spacing: getComputedStyle 返回 px 值（如 "0.375px"）或 "normal"
      // PptxGenJS charSpacing 单位是 points
      const letterSpacingPx = parseFloat(computed.letterSpacing);
      const charSpacing = (!isNaN(letterSpacingPx) && letterSpacingPx !== 0)
        ? letterSpacingPx * PT_PER_PX
        : null;

      const baseStyle = {
        fontSize: pxToPoints(computed.fontSize),
        fontFace: fontFace,
        color: rgbToHex(computed.color),
        align: computed.textAlign === 'start' ? 'left' : computed.textAlign,
        lineSpacing: pxToPoints(computed.lineHeight),
        paraSpaceBefore: pxToPoints(computed.marginTop),
        paraSpaceAfter: pxToPoints(computed.marginBottom),
        // PptxGenJS margin array is [left, right, bottom, top] (not [top, right, bottom, left] as documented)
        margin: [
          pxToPoints(computed.paddingLeft),
          pxToPoints(computed.paddingRight),
          pxToPoints(computed.paddingBottom),
          pxToPoints(computed.paddingTop)
        ]
      };

      if (charSpacing !== null) baseStyle.charSpacing = charSpacing;

      const transparency = extractAlpha(computed.color);
      if (transparency !== null) baseStyle.transparency = transparency;

      if (rotation !== null) baseStyle.rotate = rotation;
      if (vert !== null) baseStyle.vert = vert;

      const hasFormatting = el.querySelector('b, i, u, strong, em, span, br, pre, code, span');

      if (hasFormatting || isPreOrCode) {
        // Text with inline formatting (including PRE and CODE)
        const transformStr = computed.textTransform;
        // 对于 PRE 和 CODE，不应用 text-transform（保留原始大小写）
        const transformFunc = isPreOrCode ? (str) => str : (str) => applyTextTransform(str, transformStr);
        const runs = parseInlineFormatting(el, {}, [], transformFunc);

        // Adjust lineSpacing based on largest fontSize in runs
        const adjustedStyle = { ...baseStyle };
        if (adjustedStyle.lineSpacing) {
          const maxFontSize = Math.max(
            adjustedStyle.fontSize,
            ...runs.map(r => r.options?.fontSize || 0)
          );
          if (maxFontSize > adjustedStyle.fontSize) {
            const lineHeightMultiplier = adjustedStyle.lineSpacing / adjustedStyle.fontSize;
            adjustedStyle.lineSpacing = maxFontSize * lineHeightMultiplier;
          }
        }

        elements.push({
          type: el.tagName.toLowerCase(),
          text: runs,
          position: { x: pxToInch(x), y: pxToInch(y), w: pxToInch(w), h: pxToInch(h) },
          style: adjustedStyle
        });
      } else {
        // Plain text - inherit CSS formatting
        const textTransform = computed.textTransform;
        const transformedText = applyTextTransform(text, textTransform);

        const isBold = computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 600;

        elements.push({
          type: el.tagName.toLowerCase(),
          text: transformedText,
          position: { x: pxToInch(x), y: pxToInch(y), w: pxToInch(w), h: pxToInch(h) },
          style: {
            ...baseStyle,
            bold: isBold && !shouldSkipBold(computed.fontFamily),
            italic: computed.fontStyle === 'italic',
            underline: computed.textDecoration.includes('underline')
          }
        });
      }

      // 将当前元素及其所有子元素添加到 processed 集合，防止重复提取
      // 这确保 <p><span>text</span></p> 不会把 span 再单独提取一次
      processed.add(el);
      el.querySelectorAll('*').forEach(child => processed.add(child));
    });

    return { background, elements, placeholders, errors, warnings };
  });
}

/**
 * 辅助函数：将页面中的 SVG 元素转换为 PNG 图片
 * 
 * 功能：
 *   1. 查找页面中所有 SVG 元素
 *   2. 获取每个 SVG 的位置、尺寸和透明度
 *   3. 使用 Playwright 截图功能将 SVG 截取为 PNG
 *   4. 返回图片元素数组，可以直接添加到 slideData.elements
 * 
 * 为什么需要转换？
 *   - PptxGenJS 不支持直接插入 SVG
 *   - PowerPoint 对 SVG 的支持有限（需要 Office 2016+）
 *   - 转换为 PNG 可以确保兼容性
 * 
 * @param {Page} page - Playwright 页面对象
 * @param {string} tmpDir - 临时目录路径（用于保存截图）
 * @returns {Promise<Array>} 图片元素数组
 */
async function convertSvgToPng(page, tmpDir) {
  const PX_PER_IN = 96;  // 像素/英寸
  const pxToInch = (px) => px / PX_PER_IN;
  
  // 获取所有 SVG 元素的信息（只处理顶层 SVG，不处理嵌套在其他 SVG 中的 SVG）
  // 关键改进：同时提取 SVG 的 outerHTML，用于 sharp 直接渲染，避免截图带入背景色
  const svgInfoList = await page.evaluate(() => {
    const svgs = document.querySelectorAll('svg');
    const results = [];
    let topLevelIndex = 0;
    
    for (let i = 0; i < svgs.length; i++) {
      const svg = svgs[i];
      if (svg.parentElement && svg.parentElement.closest('svg')) {
        continue;
      }
      
      const rect = svg.getBoundingClientRect();
      const computed = window.getComputedStyle(svg);
      
      if (rect.width > 0 && rect.height > 0 && computed.display !== 'none') {
        // 克隆 SVG 并确保它有明确的 xmlns 和 width/height 属性
        const clone = svg.cloneNode(true);
        if (!clone.getAttribute('xmlns')) {
          clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        }
        // 设置显式的宽高（用渲染尺寸），确保 sharp 能正确渲染
        clone.setAttribute('width', Math.ceil(rect.width));
        clone.setAttribute('height', Math.ceil(rect.height));
        
        results.push({
          domIndex: i,
          topLevelIndex,
          position: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          },
          opacity: parseFloat(computed.opacity),
          svgMarkup: clone.outerHTML
        });
      }
      
      topLevelIndex++;
    }
    
    return results;
  });
  
  if (svgInfoList.length === 0) {
    return [];
  }
  
  logger.log(`📐 Found ${svgInfoList.length} SVG element(s), converting to PNG via sharp...`);
  
  const imageElements = [];
  
  for (const svgInfo of svgInfoList) {
    try {
      const timestamp = Date.now();
      const pngPath = path.join(tmpDir, `svg_${timestamp}_${svgInfo.topLevelIndex}.png`);
      
      // 用 sharp 将 SVG 字符串直接渲染为透明 PNG
      // 这样完全不会带入任何背景色或其他层叠元素
      const svgBuffer = Buffer.from(svgInfo.svgMarkup);
      const outputWidth = Math.ceil(svgInfo.position.width * 2);  // 2x 以获得更清晰的输出
      const outputHeight = Math.ceil(svgInfo.position.height * 2);
      
      await sharp(svgBuffer, { density: 192 })  // 192 DPI = 2x 缩放
        .resize(outputWidth, outputHeight, { fit: 'fill' })
        .png()
        .toFile(pngPath);
      
      // 计算透明度
      const transparency = svgInfo.opacity < 1 ? Math.round((1 - svgInfo.opacity) * 100) : null;
      
      const imageData = {
        type: 'image',
        src: pngPath,
        svgIndex: svgInfo.topLevelIndex,
        position: {
          x: pxToInch(svgInfo.position.left),
          y: pxToInch(svgInfo.position.top),
          w: pxToInch(svgInfo.position.width),
          h: pxToInch(svgInfo.position.height)
        }
      };
      
      if (transparency !== null) {
        imageData.transparency = transparency;
      }
      
      imageElements.push(imageData);
      logger.log(`   ✓ SVG #${svgInfo.topLevelIndex + 1}: ${Math.round(svgInfo.position.width)}x${Math.round(svgInfo.position.height)}px → ${pngPath} (sharp)`);
      
    } catch (err) {
      logger.error(`   ✗ SVG #${svgInfo.topLevelIndex + 1}: Failed to convert via sharp - ${err.message}`);
      
      // 回退：如果 sharp 失败，尝试用 Playwright 截图（但先隐藏所有祖先的背景）
      try {
        const svgHandles = await page.$$('svg');
        const svgHandle = svgHandles[svgInfo.domIndex];
        if (svgHandle) {
          const pngPath = path.join(tmpDir, `svg_fallback_${Date.now()}_${svgInfo.topLevelIndex}.png`);
          
          // 隐藏所有祖先的背景和兄弟元素
          await page.evaluate((idx) => {
            const svgs = document.querySelectorAll('svg');
            const svg = svgs[idx];
            if (!svg) return;
            // 隐藏兄弟元素
            const parent = svg.parentElement;
            if (parent) {
              Array.from(parent.children).filter(c => c !== svg).forEach(sib => {
                sib.dataset._origVis = sib.style.visibility || '';
                sib.style.visibility = 'hidden';
              });
            }
            // 临时移除祖先元素的背景
            let ancestor = svg.parentElement;
            const savedBgs = [];
            while (ancestor && ancestor !== document.body) {
              savedBgs.push({ el: ancestor, bg: ancestor.style.background, bgColor: ancestor.style.backgroundColor });
              ancestor.style.background = 'transparent';
              ancestor.style.backgroundColor = 'transparent';
              ancestor = ancestor.parentElement;
            }
            svg.dataset._savedBgs = JSON.stringify(savedBgs.map((_, i) => i));
          }, svgInfo.domIndex);
          
          const screenshot = await svgHandle.screenshot({ type: 'png', omitBackground: true });
          
          // 恢复
          await page.evaluate((idx) => {
            const svgs = document.querySelectorAll('svg');
            const svg = svgs[idx];
            if (!svg) return;
            const parent = svg.parentElement;
            if (parent) {
              Array.from(parent.children).filter(c => c !== svg).forEach(sib => {
                sib.style.visibility = sib.dataset._origVis || '';
                delete sib.dataset._origVis;
              });
            }
          }, svgInfo.domIndex);
          
          fs.writeFileSync(pngPath, screenshot);
          
          const transparency = svgInfo.opacity < 1 ? Math.round((1 - svgInfo.opacity) * 100) : null;
          const imageData = {
            type: 'image',
            src: pngPath,
            svgIndex: svgInfo.topLevelIndex,
            position: {
              x: pxToInch(svgInfo.position.left),
              y: pxToInch(svgInfo.position.top),
              w: pxToInch(svgInfo.position.width),
              h: pxToInch(svgInfo.position.height)
            }
          };
          if (transparency !== null) imageData.transparency = transparency;
          imageElements.push(imageData);
          logger.log(`   ✓ SVG #${svgInfo.topLevelIndex + 1}: fallback screenshot succeeded`);
        }
      } catch (fallbackErr) {
        logger.error(`   ✗ SVG #${svgInfo.topLevelIndex + 1}: Fallback also failed - ${fallbackErr.message}`);
      }
    }
  }
  
  return imageElements;
}

/**
 * 将带有 CSS 渐变背景的 DIV 元素转换为 PNG 图片
 * 
 * 思路（类似 SVG 的提取方案）：
 *   1. 在原页面中收集所有带渐变的 div 的样式信息（纯数据提取）
 *   2. 在一个**独立的空白新页面**中创建同尺寸元素，只设渐变背景
 *   3. 对该独立页面截图，得到纯净的渐变图片（不含原页面的任何内容）
 *   4. 返回图片元素数组，后续替换 elements 中的 gradient_placeholder
 * 
 * @param {Object} page - 原始 Playwright 页面对象（用于提取渐变信息）
 * @param {Object} browser - Playwright 浏览器对象（用于创建独立截图页面）
 * @param {string} tmpDir - 临时目录路径
 * @returns {Promise<Array>} 图片元素数组
 */
async function convertGradientDivsToPng(page, browser, tmpDir) {
  const PX_PER_IN = 96;
  const pxToInch = (px) => px / PX_PER_IN;

  // 第 1 步：在原页面中收集所有带渐变的 div 的样式信息（纯数据，不做任何 DOM 修改）
  const gradientInfoList = await page.evaluate(() => {
    const allDivs = document.querySelectorAll('div');
    const results = [];
    let gradientIndex = 0;

    for (const div of allDivs) {
      const computed = window.getComputedStyle(div);
      const bgImage = computed.backgroundImage;
      if (!bgImage || bgImage === 'none') continue;
      if (!bgImage.includes('linear-gradient') && !bgImage.includes('radial-gradient')) continue;

      const rect = div.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (computed.display === 'none' || computed.visibility === 'hidden') continue;

      results.push({
        gradientIndex,
        position: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        },
        opacity: parseFloat(computed.opacity),
        bgImage: bgImage,
        borderRadius: computed.borderRadius,
        bgSize: computed.backgroundSize,
        bgPosition: computed.backgroundPosition,
        bgRepeat: computed.backgroundRepeat
      });
      gradientIndex++;
    }

    return results;
  });

  if (gradientInfoList.length === 0) {
    return [];
  }

  logger.log(`🎨 Found ${gradientInfoList.length} gradient DIV(s), converting to PNG via isolated page...`);

  const imageElements = [];

  // 第 2 步：创建一个独立的空白页面用于截图（与原页面完全隔离）
  const screenshotPage = await browser.newPage();

  try {
    for (const info of gradientInfoList) {
      try {
        const timestamp = Date.now();
        const pngPath = path.join(tmpDir, `gradient_${timestamp}_${info.gradientIndex}.png`);

        const w = Math.ceil(info.position.width);
        const h = Math.ceil(info.position.height);

        // 设置视口刚好匹配元素尺寸
        await screenshotPage.setViewportSize({ width: w, height: h });

        // 在空白页中创建一个只有渐变背景的元素
        await screenshotPage.setContent(`<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  body { width: ${w}px; height: ${h}px; background: transparent; }
</style></head><body>
<div id="grad" style="
  width: ${w}px;
  height: ${h}px;
  background-image: ${info.bgImage};
  background-size: ${info.bgSize};
  background-position: ${info.bgPosition};
  background-repeat: ${info.bgRepeat};
  border-radius: ${info.borderRadius};
  opacity: ${info.opacity};
"></div>
</body></html>`, { waitUntil: 'load' });

        // 对该独立元素截图（omitBackground 确保背景透明）
        const gradHandle = await screenshotPage.$('#grad');
        const screenshot = await gradHandle.screenshot({
          type: 'png',
          omitBackground: true
        });

        fs.writeFileSync(pngPath, screenshot);

        const imageData = {
          type: 'image',
          src: pngPath,
          gradientIndex: info.gradientIndex,
          position: {
            x: pxToInch(info.position.left),
            y: pxToInch(info.position.top),
            w: pxToInch(info.position.width),
            h: pxToInch(info.position.height)
          }
        };

        imageElements.push(imageData);
        logger.log(`   ✓ Gradient #${info.gradientIndex + 1}: ${w}x${h}px → ${pngPath}`);
      } catch (err) {
        logger.error(`   ✗ Gradient #${info.gradientIndex + 1}: Failed to convert - ${err.message}`);
      }
    }
  } finally {
    await screenshotPage.close();
  }

  return imageElements;
}

/**
 * 主函数：将HTML文件转换为PowerPoint幻灯片
 * 
 * 工作流程：
 *   1. 启动浏览器（使用Playwright）
 *   2. 加载HTML文件
 *   3. 获取body尺寸并检查溢出
 *   4. 提取所有元素数据（背景、文本、图片、形状等）
 *   5. 验证数据（尺寸匹配、位置检查等）
 *   6. 创建幻灯片并添加元素
 *   7. 返回幻灯片对象和占位符信息
 * 
 * @param {string} htmlFile - HTML文件路径
 * @param {Object} pres - PptxGenJS演示文稿对象
 * @param {Object} options - 选项对象
 *   - tmpDir: 临时目录路径（默认：process.env.TMPDIR || '/tmp'）
 *   - slide: 目标幻灯片对象（如果提供，则使用该幻灯片；否则创建新幻灯片）
 *   - isDebug: 是否启用调试模式（默认：false）
 *              true: 打印所有日志（log, warn, error）
 *              false: 仅打印 error 日志
 * @returns {Promise<Object>} 包含slide和placeholders的对象
 */
async function html2pptx(htmlFile, pres, options = {}) {
  // 解构选项，设置默认值
  const {
    tmpDir = process.env.TMPDIR || '/tmp',  // 临时目录
    slide = null,                            // 目标幻灯片（null表示创建新幻灯片）
    isDebug = false                          // 调试模式
  } = options;

  // 设置调试模式
  setDebugMode(isDebug);

  try {
    // ========================================================================
    // 第一步：启动浏览器
    // ========================================================================
    // 配置启动选项
    const launchOptions = { env: { TMPDIR: tmpDir } };
    
    // macOS系统使用Chrome，其他系统使用默认Chromium
    if (process.platform === 'darwin') {
      launchOptions.channel = 'chrome';
    }

    const browser = await chromium.launch(launchOptions);

    let bodyDimensions;  // body尺寸信息
    let slideData;       // 提取的幻灯片数据

    // 处理文件路径（支持绝对路径和相对路径）
    const filePath = path.isAbsolute(htmlFile) ? htmlFile : path.join(process.cwd(), htmlFile);

    try {
      // ========================================================================
      // 第二步：加载HTML并提取数据
      // ========================================================================
      const page = await browser.newPage();
      // 注意：浏览器控制台消息不记录，避免噪音

      // 加载HTML文件（使用file://协议）
      await page.goto(`file://${filePath}`);

      // 获取body尺寸并检查溢出
      bodyDimensions = await getBodyDimensions(page);

      // 设置视口大小（匹配body尺寸）
      await page.setViewportSize({
        width: Math.round(bodyDimensions.width),
        height: Math.round(bodyDimensions.height)
      });

      // 提取幻灯片数据（这是最核心的步骤）
      // 注意：extractSlideData 会为 SVG 元素插入 svg_placeholder 占位符，保持 DOM 顺序
      slideData = await extractSlideData(page);

      // ========================================================================
      // 第 2.5 步：将 SVG 元素转换为 PNG 图片
      // ========================================================================
      // SVG 无法直接导入 PowerPoint，需要先截图转换为 PNG
      const svgScreenshots = await convertSvgToPng(page, tmpDir);
      
      // 将 SVG 截图替换 elements 中对应的 svg_placeholder 占位符
      // 这样 SVG 图片保持在 DOM 中的原始位置，不会破坏层叠顺序
      if (svgScreenshots && svgScreenshots.length > 0) {
        // 建立 svgIndex -> 截图数据的映射
        const svgMap = new Map();
        for (const screenshot of svgScreenshots) {
          svgMap.set(screenshot.svgIndex, screenshot);
        }
        
        // 遍历 elements，将 svg_placeholder 替换为对应的截图数据
        for (let i = 0; i < slideData.elements.length; i++) {
          const el = slideData.elements[i];
          if (el.type === 'svg_placeholder') {
            const screenshotData = svgMap.get(el.svgIndex);
            if (screenshotData) {
              // 替换占位符为真实的图片元素
              slideData.elements[i] = screenshotData;
            } else {
              // 如果没有对应的截图（SVG 不可见或转换失败），移除占位符
              slideData.elements.splice(i, 1);
              i--;  // 调整索引
            }
          }
        }
      } else {
        // 没有 SVG 截图，移除所有 svg_placeholder
        slideData.elements = slideData.elements.filter(el => el.type !== 'svg_placeholder');
      }
      
      // ========================================================================
      // 第 2.55 步：将带渐变背景的 DIV 元素转换为 PNG 图片
      // ========================================================================
      // CSS 渐变无法用 PptxGenJS 原生表达，需要截图转为 PNG
      const gradientScreenshots = await convertGradientDivsToPng(page, browser, tmpDir);
      
      // 将渐变截图替换 elements 中对应的 gradient_placeholder 占位符
      if (gradientScreenshots && gradientScreenshots.length > 0) {
        const gradientMap = new Map();
        for (const screenshot of gradientScreenshots) {
          gradientMap.set(screenshot.gradientIndex, screenshot);
        }
        
        for (let i = 0; i < slideData.elements.length; i++) {
          const el = slideData.elements[i];
          if (el.type === 'gradient_placeholder') {
            const screenshotData = gradientMap.get(el.gradientIndex);
            if (screenshotData) {
              slideData.elements[i] = screenshotData;
            } else {
              slideData.elements.splice(i, 1);
              i--;
            }
          }
        }
      } else {
        slideData.elements = slideData.elements.filter(el => el.type !== 'gradient_placeholder');
      }
      
      // ========================================================================
      // 第 2.6 步：处理需要截图的图片（object-fit: cover）
      // ========================================================================
      // object-fit: cover 的图片在 PowerPoint 中无法直接裁剪，需要截图
      const coverImages = slideData.elements.filter(el => el.type === 'image' && el.needsScreenshot);
      if (coverImages.length > 0) {
        logger.log(`🖼️  Found ${coverImages.length} image(s) with object-fit: cover, taking screenshots...`);
        
        for (let i = 0; i < coverImages.length; i++) {
          const imgEl = coverImages[i];
          try {
            // 查找对应的 img 元素（通过 src 匹配）
            const imgHandle = await page.$(`img[src="${imgEl.src}"]`);
            if (!imgHandle) {
              logger.error(`   ✗ Image #${i + 1}: Could not find element`);
              continue;
            }
            
            // 生成唯一的文件名
            const timestamp = Date.now();
            const pngPath = path.join(tmpDir, `cover_img_${timestamp}_${i}.png`);
            
            // 截图该图片元素（会自动应用 object-fit: cover 的裁剪效果）
            const screenshot = await imgHandle.screenshot({
              type: 'png'
            });
            
            // 保存截图到临时文件
            fs.writeFileSync(pngPath, screenshot);
            
            // 更新图片源为截图文件
            imgEl.src = pngPath;
            delete imgEl.needsScreenshot;  // 移除标记
            
            logger.log(`   ✓ Image #${i + 1}: ${Math.round(imgEl.position.w * 96)}x${Math.round(imgEl.position.h * 96)}px → ${pngPath}`);
          } catch (err) {
            logger.error(`   ✗ Image #${i + 1}: Failed to screenshot - ${err.message}`);
          }
        }
      }
    } finally {
      // 确保浏览器被关闭（即使出错也要关闭）
      await browser.close();
    }

    // ========================================================================
    // 第三步：收集警告并输出（不会导致失败）
    // ========================================================================
    const allWarnings = [];
    if (slideData.warnings && slideData.warnings.length > 0) {
      allWarnings.push(...slideData.warnings);
    }
    
    // 输出警告信息（不影响转换）
    if (allWarnings.length > 0) {
      logger.warn(`⚠️  ${htmlFile}: ${allWarnings.length} warning(s):`);
      allWarnings.forEach((w, i) => logger.warn(`   ${i + 1}. ${w}`));
    }

    // ========================================================================
    // 第四步：收集溢出警告（不再作为错误阻止转换）
    // ========================================================================
    // 检查body溢出 - 改为警告，不阻止转换
    if (bodyDimensions.errors && bodyDimensions.errors.length > 0) {
      allWarnings.push(...bodyDimensions.errors);
    }

    // 检查尺寸匹配错误 - 改为警告，不阻止转换
    const dimensionErrors = validateDimensions(bodyDimensions, pres);
    if (dimensionErrors.length > 0) {
      // 将尺寸不匹配改为警告，而不是错误
      allWarnings.push(...dimensionErrors);
    }

    // 检查文本框位置错误 - 改为警告，不阻止转换
    const textBoxPositionErrors = validateTextBoxPosition(slideData, bodyDimensions);
    if (textBoxPositionErrors.length > 0) {
      // 将溢出警告记录下来，但不阻止转换
      allWarnings.push(...textBoxPositionErrors);
    }

    // 注意：slideData.errors 现在只包含严重错误（如果有的话）
    // 溢出错误也改为警告，不阻止转换
    if (slideData.errors && slideData.errors.length > 0) {
      allWarnings.push(...slideData.errors);
    }

    // ========================================================================
    // 第五步：不再因为溢出而抛出错误，允许转换继续
    // ========================================================================
    // 溢出内容可能显示不完整，但至少能生成幻灯片

    // ========================================================================
    // 第六步：创建幻灯片并添加元素
    // ========================================================================
    // 使用提供的幻灯片或创建新幻灯片
    const targetSlide = slide || pres.addSlide();

    // 添加背景
    await addBackground(slideData, targetSlide, tmpDir);
    
    // 添加所有元素（按正确顺序：形状->图片->文本）
    addElements(slideData, targetSlide, pres);

    // 返回结果
    return { 
      slide: targetSlide,                           // 生成的幻灯片对象
      placeholders: slideData.placeholders,         // 占位符数组（用于后续添加图表等）
      warnings: allWarnings                         // 警告信息
    };
  } catch (error) {
    // 错误处理：如果错误消息不包含文件名，添加文件名前缀
    if (!error.message.startsWith(htmlFile)) {
      throw new Error(`${htmlFile}: ${error.message}`);
    }
    throw error;
  }
}

// 导出函数
module.exports = html2pptx;