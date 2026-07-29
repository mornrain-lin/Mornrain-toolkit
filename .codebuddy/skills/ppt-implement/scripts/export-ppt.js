#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { createLogger } = require('./lib/logger');
const { imagesToPdf } = require('./export/images2pdf');

// 创建日志器
const logger = createLogger('export-ppt');

/**
 * 主函数
 */
async function main() {
    logger.log(`==== export-ppt.js =====`);
    // 从命令行参数获取路径
    const args = process.argv.slice(2);
    const pluginRoot = args[0];
    const projectDir = args[1];

    logger.log('[PPT Stop Hook] 开始执行...');

    // 验证参数
    if (!pluginRoot || !projectDir) {
        logger.error('[PPT Stop Hook] 错误: 需要传入 CODEBUDDY_PLUGIN_ROOT 和 CODEBUDDY_PROJECT_DIR 参数');
        logger.error('[PPT Stop Hook] 用法: node stop.js <CODEBUDDY_PLUGIN_ROOT> <CODEBUDDY_PROJECT_DIR>');
        process.exit(1);
    }

    logger.log(`[PPT Stop Hook] CODEBUDDY_PLUGIN_ROOT: ${pluginRoot}`);
    logger.log(`[PPT Stop Hook] CODEBUDDY_PROJECT_DIR: ${projectDir}`);

    // 检查 project.json 是否存在
    const projectJsonPath = path.join(projectDir, 'docs', 'project.json');
    if (!fs.existsSync(projectJsonPath)) {
        logger.log(`[PPT Stop Hook] project.json 不存在，跳过: ${projectJsonPath}`);
        process.exit(0);
    }

    // 读取并解析 project.json
    let projectJson;
    try {
        const content = fs.readFileSync(projectJsonPath, 'utf8');
        projectJson = JSON.parse(content);
    } catch (e) {
        logger.error(`[PPT Stop Hook] 无法解析 project.json: ${e.message}`);
        process.exit(0);
    }

    // 检查 project_type 是否为 'ppt'
    if (projectJson.project_type !== 'ppt') {
        logger.log(`[PPT Stop Hook] project_type 不是 'ppt'，跳过: ${projectJson.project_type}`);
        process.exit(0);
    }

    // 检查是否存在 slide-*.js 文件
    const slidesDir = path.join(projectDir, 'frontend', 'src', 'slides');
    if (!fs.existsSync(slidesDir)) {
        logger.log(`[PPT Stop Hook] slides 目录不存在，跳过: ${slidesDir}`);
        process.exit(0);
    }

    const slideFiles = fs.readdirSync(slidesDir).filter(f => /^slide-.*\.js$/.test(f));
    

    logger.log(`[PPT Stop Hook] 找到 ${slideFiles.length} 个 slide 文件`);

    // 检查index.html 与 slide-*.js是否一致，如果不一致，则需要更新index.html
    // 情况1: index.html 引用 slide-N.js，但 slide-N.js 不存在
    // 情况2: 存在slide-N.js，但 index.html 没有引用
    // 针对以上两种情况，你都需要更新index.html
    const indexHtmlPath = path.join(projectDir, 'frontend', 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
        logger.log(`[PPT Stop Hook] index.html 不存在，跳过: ${indexHtmlPath}`);
        process.exit(0);
    }
    
    // 同步 index.html 与 slide-*.js 文件
    syncIndexHtmlWithSlides(indexHtmlPath, slidesDir, slideFiles);

    // 如果没有 slide-*.js 文件，跳过，不继续构建了
    if (slideFiles.length === 0) {
        logger.log('[PPT Stop Hook] 没有找到 slide-*.js 文件，跳过');
        process.exit(0);
    }

    // 执行构建命令
    const frontendDir = path.join(projectDir, 'frontend');
    
    logger.log('[PPT Stop Hook] 开始构建...');

    // 去重逻辑：检查 slides 目录是否有变化
    const artifactsDir = path.join(projectDir, 'artifacts');
    // 确保 artifacts 目录存在
    if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
    }
    const versionFilePath = path.join(artifactsDir, '.slides_version');
    const pptxFilePath = path.join(artifactsDir, 'presentation.pptx');
    const { shouldGeneratePptx, shouldGeneratePdf, currentMd5 } = checkShouldGenerate(slidesDir, versionFilePath, pptxFilePath);
    
    if (!shouldGeneratePptx && !shouldGeneratePdf) {
        process.exit(0);
    }

    // result.json 路径，与 pptx 同目录
    const resultFilePath = path.join(artifactsDir, 'result.json');

    // 每次重新生成前先清理旧的 result.json
    if (fs.existsSync(resultFilePath)) {
        fs.unlinkSync(resultFilePath);
        logger.log(`[PPT Stop Hook] 已清理旧的 result.json`);
    }

    // 依次执行构建命令（后台运行）
    const commands = [
        ['yarn', ['build']],
        ['yarn', ['build:slides']]
    ];

    // 异步执行所有命令，不阻塞主进程
    await runCommandsSequentially(commands, frontendDir);

    // 按需生成 PDF（基于截图文件）
    let pdfResult = { success: true, message: '' };
    if (shouldGeneratePdf) {
        pdfResult = await runExportPdf(pluginRoot, projectDir, slideFiles.length, pptxFilePath);
    } else {
        logger.log('[PPT Stop Hook] PDF 已存在且 slides 未变化，跳过 PDF 生成');
    }

    // 按需生成 PPTX
    let pptxResult = { success: true, message: '' };
    if (shouldGeneratePptx) {
        pptxResult = await runExportPptx(pluginRoot, projectDir, frontendDir, pptxFilePath);
    } else {
        logger.log('[PPT Stop Hook] PPTX 已存在且 slides 未变化，跳过 PPTX 生成');
    }

    // 写入 result.json
    const resultData = {
        pptx: {
            code: pptxResult.success ? 0 : 1,
            message: pptxResult.message
        },
        pdf: {
            code: pdfResult.success ? 0 : 1,
            message: pdfResult.message
        }
    };
    fs.writeFileSync(resultFilePath, JSON.stringify(resultData, null, 2), 'utf8');
    logger.log(`[PPT Stop Hook] 已写入 result.json: ${resultFilePath}`);

    // 所有需要生成的产物都成功后，才保存版本文件
    if (pdfResult.success && pptxResult.success) {
        fs.writeFileSync(versionFilePath, currentMd5, 'utf8');
        logger.log(`[PPT Stop Hook] 已保存版本文件: ${versionFilePath}`);
    } else {
        logger.log('[PPT Stop Hook] 有产物生成失败，不保存版本文件，下次会重试');
    }
}

/**
 * 依次执行命令列表
 */
async function runCommandsSequentially(commands, cwd) {
    for (const [cmd, args] of commands) {
        try {
            logger.log(`[PPT Stop Hook] 执行: ${cmd} ${args.join(' ')}`);
            await runCommand(cmd, args, cwd);
            logger.log(`[PPT Stop Hook] 完成: ${cmd} ${args.join(' ')}`);
        } catch (error) {
            logger.error(`[PPT Stop Hook] 命令失败: ${cmd} ${args.join(' ')} - ${error.message}`);
            // 继续执行下一个命令
        }
    }
    logger.log('[PPT Stop Hook] 所有构建任务完成');
}

/**
 * 执行图片转 PDF 导出
 * 从 frontend/public/assets/images/posters/pages/ 目录读取 page-{页码}.png 文件，合成 PDF
 * 如果截图目录不存在、截图文件缺失或数量与 slide 数不一致，会先调用 screenshot-ppt.py 进行截图
 * @param {string} pluginRoot - 插件根目录路径 (CODEBUDDY_PLUGIN_ROOT)
 * @param {string} projectDir - 项目根目录路径
 * @param {number} totalSlides - slide-*.js 文件总数，截图数应与之对应
 * @param {string} pptxFilePath - PPTX 文件路径（用于推导 PDF 输出路径）
 * @returns {Promise<{success: boolean, message: string}>} 生成结果
 */
async function runExportPdf(pluginRoot, projectDir, totalSlides, pptxFilePath) {
    const imagesDir = path.join(projectDir, 'frontend', 'public', 'assets', 'images', 'posters', 'pages');

    // 检查截图是否完整：目录存在、数量匹配、每个 page-{1..N}.png 都存在
    let needScreenshot = false;
    if (!fs.existsSync(imagesDir)) {
        logger.log('[PPT Stop Hook] 截图目录不存在，先执行截图: ' + imagesDir);
        needScreenshot = true;
    } else {
        // 逐一检查 page-1.png ~ page-{totalSlides}.png 是否都存在
        const missingPages = [];
        for (let i = 1; i <= totalSlides; i++) {
            const pagePath = path.join(imagesDir, `page-${i}.png`);
            if (!fs.existsSync(pagePath)) {
                missingPages.push(i);
            }
        }
        if (missingPages.length > 0) {
            logger.log(`[PPT Stop Hook] 缺少 ${missingPages.length} 张截图 (page: ${missingPages.join(', ')}), 共需 ${totalSlides} 张，先执行截图`);
            needScreenshot = true;
        } else {
            logger.log(`[PPT Stop Hook] 截图完整，共 ${totalSlides} 张`);
        }
    }

    if (needScreenshot) {
        const screenshotScript = path.join(pluginRoot, 'skills', 'ppt-implement', 'scripts', 'screenshot-ppt.py');
        const screenshotUrl = 'http://localhost:5173';
        const screenshotOutput = imagesDir;

        logger.log(`[PPT Stop Hook] 执行截图脚本: python3 ${screenshotScript} --url ${screenshotUrl} --output ${screenshotOutput}`);
        try {
            await runCommand('python3', [screenshotScript, '--url', screenshotUrl, '--output', screenshotOutput], projectDir);
            logger.log('[PPT Stop Hook] 截图脚本执行完成');
        } catch (error) {
            const msg = `截图脚本执行失败: ${error.message}`;
            logger.error(`[PPT Stop Hook] ${msg}`);
            return { success: false, message: msg };
        }
    }

    // 截图完成后重新检查文件
    if (!fs.existsSync(imagesDir)) {
        const msg = '截图后目录仍不存在，跳过 PDF 生成';
        logger.log(`[PPT Stop Hook] ${msg}: ${imagesDir}`);
        return { success: false, message: msg };
    }

    const pageFiles = fs.readdirSync(imagesDir).filter(f => /^page-\d+\.png$/.test(f));
    if (pageFiles.length === 0) {
        const msg = '截图后仍没有 page-*.png 文件，跳过 PDF 生成';
        logger.log(`[PPT Stop Hook] ${msg}`);
        return { success: false, message: msg };
    }

    // PDF 输出路径与 PPTX 同目录
    const pdfFilePath = pptxFilePath.replace(/\.pptx$/, '.pdf');

    logger.log(`[PPT Stop Hook] 执行 PDF 生成: ${pageFiles.length} 张截图 -> ${pdfFilePath}`);
    try {
        const result = await imagesToPdf(imagesDir, pdfFilePath);
        logger.log(`[PPT Stop Hook] PDF 生成完成: ${result.outputPath}, 页数: ${result.pageCount}`);
        return { success: true, message: '' };
    } catch (error) {
        const msg = `PDF 生成失败: ${error.message}`;
        logger.error(`[PPT Stop Hook] ${msg}`);
        return { success: false, message: msg };
    }
}


/**
 * 执行 HTML 转 PPTX 导出
 * @param {string} pluginRoot - 插件根目录路径 (CODEBUDDY_PLUGIN_ROOT)
 * @param {string} projectDir - 项目根目录路径 (CODEBUDDY_PROJECT_DIR)
 * @param {string} frontendDir - 前端目录路径
 * @param {string} pptxFilePath - 输出 PPTX 文件路径
 * @returns {Promise<{success: boolean, message: string}>} 生成结果
 */
async function runExportPptx(pluginRoot, projectDir, frontendDir, pptxFilePath) {
    // 定义路径
    const html2pptxScript = path.join(pluginRoot, 'skills', 'ppt-implement', 'scripts', 'export', 'html2pptx.js');
    const distSlidesDir = path.join(frontendDir, 'dist-slides');
    const allSlidesHtml = path.join(distSlidesDir, 'all-slides.html');
    const outputPptx = pptxFilePath;

    // 执行 html2pptx.js 脚本，将 HTML 幻灯片转换为 PPTX 格式
    logger.log(`[PPT Stop Hook] 执行: node ${html2pptxScript} ${allSlidesHtml} ${outputPptx}`);
    let success = false;
    let message = '';
    try {
        await runCommand('node', [html2pptxScript, allSlidesHtml, outputPptx], projectDir);
        logger.log(`[PPT Stop Hook] 完成: html2pptx.js`);
        success = true;
    } catch (error) {
        message = `html2pptx.js 失败: ${error.message}`;
        logger.error(`[PPT Stop Hook] ${message}`);
    }

    // 清理 dist-slides 临时目录（由 yarn build:slides 生成）
    if (fs.existsSync(distSlidesDir)) {
        fs.rmSync(distSlidesDir, { recursive: true, force: true });
        logger.log(`[PPT Stop Hook] 已清理: ${distSlidesDir}`);
    }

    return { success, message };
}

/**
 * 运行单个命令
 */
function runCommand(cmd, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd,
            stdio: 'ignore',
            shell: process.platform === 'win32'
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`退出码: ${code}`));
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * 同步 index.html 与 slide-*.js 文件的一致性
 * 情况1: index.html 引用 slide-N.js，但 slide-N.js 不存在 -> 移除引用
 * 情况2: 存在 slide-N.js，但 index.html 没有引用 -> 添加引用
 * @param {string} indexHtmlPath - index.html 文件路径
 * @param {string} slidesDir - slides 目录路径
 * @param {string[]} slideFiles - 实际存在的 slide 文件列表
 */
function syncIndexHtmlWithSlides(indexHtmlPath, slidesDir, slideFiles) {
    try {
        let content = fs.readFileSync(indexHtmlPath, 'utf8');
        let modified = false;
        
        // 从实际文件列表中提取页码集合
        const existingSlideNums = new Set();
        for (const file of slideFiles) {
            const match = file.match(/^slide-(\d+)\.js$/);
            if (match) {
                existingSlideNums.add(parseInt(match[1], 10));
            }
        }
        
        // 从 index.html 中提取已引用的 slide 页码
        // 匹配模式: <script type="module" src="/src/slides/slide-N.js"></script>
        const scriptTagPattern = /<script\s+type="module"\s+src="\/src\/slides\/slide-(\d+)\.js"><\/script>/g;
        const referencedSlideNums = new Set();
        let match;
        while ((match = scriptTagPattern.exec(content)) !== null) {
            referencedSlideNums.add(parseInt(match[1], 10));
        }
        
        // 情况1: 移除不存在的 slide 引用
        for (const num of referencedSlideNums) {
            if (!existingSlideNums.has(num)) {
                const tagToRemove = `<script type="module" src="/src/slides/slide-${num}.js"></script>`;
                // 移除整行（包括前面的空白和后面的换行）
                const linePattern = new RegExp(`\\s*${escapeRegExp(tagToRemove)}\\n?`, 'g');
                content = content.replace(linePattern, '');
                logger.log(`[syncIndexHtml] 移除不存在的引用: slide-${num}.js`);
                modified = true;
            }
        }
        
        // 情况2: 添加缺失的 slide 引用
        const missingNums = [];
        for (const num of existingSlideNums) {
            if (!referencedSlideNums.has(num)) {
                missingNums.push(num);
            }
        }
        
        if (missingNums.length > 0) {
            // 按页码排序
            missingNums.sort((a, b) => a - b);
            
            // 生成要插入的 script 标签
            const scriptTags = missingNums.map(num => 
                `    <script type="module" src="/src/slides/slide-${num}.js"></script>`
            ).join('\n');
            
            // 在 </body> 前插入
            content = content.replace('</body>', `${scriptTags}\n  </body>`);
            logger.log(`[syncIndexHtml] 添加缺失的引用: ${missingNums.map(n => `slide-${n}.js`).join(', ')}`);
            modified = true;
        }
        
        // 如果有修改，写回文件
        if (modified) {
            fs.writeFileSync(indexHtmlPath, content, 'utf8');
            logger.log('[syncIndexHtml] index.html 已更新');
        } else {
            logger.log('[syncIndexHtml] index.html 无需更新');
        }
    } catch (e) {
        logger.error(`[syncIndexHtml] 同步 index.html 出错: ${e.message}`);
    }
}

/**
 * 转义正则表达式特殊字符
 * @param {string} string - 要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 检查是否需要重新生成 PPTX 和 PDF
 * 使用统一的 slides 目录 MD5 值来判断，但分别标识 PPTX 和 PDF 是否需要生成
 * - slides 内容有变化 → PPTX 和 PDF 都需要重新生成
 * - slides 内容无变化但某个文件缺失 → 只生成缺失的那个
 * @param {string} slidesDir - slides 目录路径
 * @param {string} versionFilePath - 版本文件路径
 * @param {string} pptxFilePath - PPTX 文件路径
 * @returns {{ shouldGeneratePptx: boolean, shouldGeneratePdf: boolean, currentMd5: string }}
 */
function checkShouldGenerate(slidesDir, versionFilePath, pptxFilePath) {
    const currentMd5 = calculateDirMd5(slidesDir);
    const pdfFilePath = pptxFilePath.replace(/\.pptx$/, '.pdf');

    const pptxExists = fs.existsSync(pptxFilePath);
    const pdfExists = fs.existsSync(pdfFilePath);

    // 检查版本文件判断 slides 是否有变化
    let slidesChanged = true;
    if (fs.existsSync(versionFilePath)) {
        const savedMd5 = fs.readFileSync(versionFilePath, 'utf8').trim();
        if (savedMd5 === currentMd5) {
            slidesChanged = false;
        } else {
            logger.log('[PPT Stop Hook] slides 目录已变化，需要重新生成');
        }
    } else {
        logger.log('[PPT Stop Hook] 版本文件不存在，首次生成');
    }

    // slides 内容变了 → 两个都需要重新生成
    if (slidesChanged) {
        logger.log('[PPT Stop Hook] 需要生成 PPTX 和 PDF');
        return { shouldGeneratePptx: true, shouldGeneratePdf: true, currentMd5 };
    }

    // slides 内容没变，只检查文件是否缺失
    const shouldGeneratePptx = !pptxExists;
    const shouldGeneratePdf = !pdfExists;

    if (shouldGeneratePptx) {
        logger.log('[PPT Stop Hook] slides 未变化，但 PPTX 文件缺失，需要生成');
    }
    if (shouldGeneratePdf) {
        logger.log('[PPT Stop Hook] slides 未变化，但 PDF 文件缺失，需要生成');
    }
    if (!shouldGeneratePptx && !shouldGeneratePdf) {
        logger.log('[PPT Stop Hook] slides 目录未变化，PPTX 和 PDF 均存在，跳过生成');
    }

    return { shouldGeneratePptx, shouldGeneratePdf, currentMd5 };
}

/**
 * 计算目录的 MD5 值
 * 通过对目录中所有文件的内容和路径进行哈希来生成唯一标识
 * @param {string} dirPath - 目录路径
 * @returns {string} MD5 哈希值
 */
function calculateDirMd5(dirPath) {
    const hash = crypto.createHash('md5');
    
    // 匹配 slide-{页码}.js 的正则表达式
    const slideFilePattern = /^slide-\d+\.js$/;
    
    try {
        // 只获取 slide-{页码}.js 文件
        const entries = fs.readdirSync(dirPath);
        const slideFiles = entries
            .filter(f => slideFilePattern.test(f))
            .sort(); // 排序确保一致性
        
        for (const file of slideFiles) {
            const fullPath = path.join(dirPath, file);
            
            // 将文件名加入哈希
            hash.update(file);
            
            // 将文件内容加入哈希
            const content = fs.readFileSync(fullPath);
            hash.update(content);
        }
        
        return hash.digest('hex');
    } catch (error) {
        // 如果出错，返回空字符串，强制重新生成
        logger.error(`[PPT Stop Hook] 计算 MD5 失败: ${error.message}`);
        return '';
    }
}

// 运行主函数，捕获未处理的异常
main().catch((error) => {
    logger.error('[PPT Export] 未捕获的异常:', error.message);
    logger.error('[PPT Export] 错误堆栈:', error.stack);
    process.exit(1);
});
