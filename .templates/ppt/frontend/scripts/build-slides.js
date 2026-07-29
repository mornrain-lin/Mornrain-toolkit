#!/usr/bin/env node
/**
 * 构建脚本：将每个 slide-X.js 生成为独立的 slide-X.html 文件
 * 
 * 方案：保留 Tailwind class，将编译后的 CSS 嵌入 <style> 标签
 * 这样产出的 HTML 渲染结果与 Vite dev server 完全一致，
 * 避免了 juice 内联方案中 CSS 继承丢失、变量不支持等问题。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 输出目录
const outputDir = path.join(rootDir, 'dist-slides');

// 从 index.html 提取 <head> 中的字体、CSS 变量等（不含 script 和 Vite 注释）
function extractHeadFromIndex() {
  const indexPath = path.join(rootDir, 'index.html');
  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  
  const headMatch = indexContent.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  let headContent = '';
  if (headMatch) {
    headContent = headMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }
  
  return { headContent };
}

// 从 slide-X.js 文件中提取 HTML 内容
function extractSlideContent(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/window\.slideDataMap\.set\(\d+,\s*`([\s\S]*?)`\s*\);/);
  if (match) {
    const decoded = match[1].replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
    return decoded.trim();
  }
  return null;
}

// 获取所有 slide 文件
function getSlideFiles() {
  const slidesDir = path.join(rootDir, 'src/slides');
  const files = fs.readdirSync(slidesDir);
  return files
    .filter(f => /^slide-\d+\.js$/.test(f))
    .map(f => ({
      name: f,
      number: parseInt(f.match(/slide-(\d+)\.js/)[1]),
      path: path.join(slidesDir, f)
    }))
    .sort((a, b) => a.number - b.number);
}

// 生成 Tailwind CSS（编译所有 slide 用到的 class）
function generateTailwindCss(slideContents) {
  const tempDir = path.join(rootDir, '.temp-build');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 临时 HTML 包含所有 slide 内容，确保 Tailwind 扫描到所有 class
  const tempHtml = `<!DOCTYPE html>\n<html>\n<body>\n${slideContents.map(s => s.content).join('\n')}\n</body>\n</html>`;
  const tempHtmlPath = path.join(tempDir, 'temp-slides.html');
  fs.writeFileSync(tempHtmlPath, tempHtml);

  // 读取 main.css（包含 @tailwind 指令和自定义样式）
  const mainCss = fs.readFileSync(path.join(rootDir, 'src/styles/main.css'), 'utf-8');
  const tempCssInput = path.join(tempDir, 'input.css');
  fs.writeFileSync(tempCssInput, mainCss);

  // 临时 tailwind 配置
  const tempTailwindConfig = path.join(tempDir, 'tailwind.config.js');
  fs.writeFileSync(tempTailwindConfig, `
export default {
  content: ['${tempHtmlPath}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
`);

  const tempCssOutput = path.join(tempDir, 'output.css');
  try {
    execSync(`npx tailwindcss -i "${tempCssInput}" -o "${tempCssOutput}" -c "${tempTailwindConfig}"`, {
      cwd: rootDir,
      stdio: 'pipe'
    });
  } catch (error) {
    console.error('Tailwind CSS 处理失败:', error.message);
    throw error;
  }

  const outputCss = fs.readFileSync(tempCssOutput, 'utf-8');

  // 清理临时文件
  fs.rmSync(tempDir, { recursive: true, force: true });

  return outputCss;
}

// 转换图片路径为相对路径
function transformSlideContent(content) {
  let transformed = content;
  transformed = transformed.replace(/src="\/assets\//g, 'src="./assets/');
  transformed = transformed.replace(/src="assets\//g, 'src="./assets/');
  return transformed;
}

// 为最外层 div 添加 slide-page class（保留原有 class）
function addSlidePageClass(bodyContent) {
  // 匹配第一个 <div，可能已有 class
  bodyContent = bodyContent.replace(
    /(<div)(\s+class=")/,
    '$1$2slide-page '
  );
  // 如果第一个 div 没有 class 属性
  if (!bodyContent.match(/<div\s+class="slide-page/)) {
    bodyContent = bodyContent.replace(
      /(<div)([\s>])/,
      '$1 class="slide-page"$2'
    );
  }
  return bodyContent;
}

// 生成单个 slide 的完整 HTML
function generateSlideHtml(slideContent, headContent, tailwindCss) {
  return `<!DOCTYPE html>
<html>
<head>
${headContent}
<style>
${tailwindCss}
</style>
</head>
<body>
${slideContent}
</body>
</html>`;
}

// 生成合并的 all-slides.html
function generateMergedHtml(slideContents, headContent, tailwindCss) {
  return `<!DOCTYPE html>
<html>
<head>
${headContent}
<style>
${tailwindCss}
</style>
</head>
<body>

${slideContents.join('\n\n')}

</body>
</html>`;
}

// 主函数
async function main() {
  console.log('🚀 开始构建独立 slide HTML 文件...\n');

  // 创建输出目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 从 index.html 提取字体和 CSS 变量
  console.log('📄 从 index.html 提取字体和 CSS 变量...');
  const headInfo = extractHeadFromIndex();

  // 获取所有 slide 文件
  const slideFiles = getSlideFiles();
  console.log(`📄 找到 ${slideFiles.length} 个 slide 文件\n`);

  // 提取所有 slide 内容
  const slideContents = [];
  for (const slide of slideFiles) {
    const content = extractSlideContent(slide.path);
    if (content) {
      const transformedContent = transformSlideContent(content);
      slideContents.push({
        number: slide.number,
        content: transformedContent,
        name: slide.name
      });
    } else {
      console.warn(`⚠️  无法提取 ${slide.name} 的内容`);
    }
  }

  // 生成 Tailwind CSS
  console.log('🎨 编译 Tailwind CSS...');
  const tailwindCss = generateTailwindCss(slideContents);

  // 复制 assets 目录
  const assetsSourceDir = path.join(rootDir, 'public/assets');
  const assetsDestDir = path.join(outputDir, 'assets');
  if (fs.existsSync(assetsSourceDir)) {
    console.log('📁 复制 assets 目录...');
    fs.cpSync(assetsSourceDir, assetsDestDir, { recursive: true });
  }

  // 生成每个 slide 的 HTML 文件
  console.log('📄 生成 HTML 文件...\n');
  
  const allSlideBodyContents = [];
  
  for (const slide of slideContents) {
    // 为最外层 div 添加 slide-page class
    let bodyContent = addSlidePageClass(slide.content);
    
    allSlideBodyContents.push(bodyContent);
    
    // 生成完整 HTML
    const finalHtml = generateSlideHtml(bodyContent, headInfo.headContent, tailwindCss);
    
    // 保存到文件（下标从 0 开始）
    const outputIndex = slide.number - 1;
    const outputPath = path.join(outputDir, `slide-${outputIndex}.html`);
    fs.writeFileSync(outputPath, finalHtml);
    console.log(`   ✅ slide-${outputIndex}.html`);
  }

  // 生成合并文件
  console.log('\n📦 生成合并文件...');
  const mergedHtml = generateMergedHtml(allSlideBodyContents, headInfo.headContent, tailwindCss);
  const mergedPath = path.join(outputDir, 'all-slides.html');
  fs.writeFileSync(mergedPath, mergedHtml);
  console.log(`   ✅ all-slides.html`);

  console.log(`\n🎉 构建完成！输出目录: ${outputDir}`);
  console.log(`   共生成 ${slideContents.length} 个独立 HTML 文件 + 1 个合并文件`);
}

main().catch(console.error);
