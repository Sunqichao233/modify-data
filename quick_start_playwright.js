/**
 * Playwright自动化下载器 - 快速启动脚本
 * 使用配置文件快速开始批量下载任务
 */

const fs = require('fs');
const path = require('path');
const { PlaywrightDownloader } = require('./playwright_downloader');

/**
 * 加载配置文件
 */
function loadConfig(configPath = './playwright_config.json') {
    try {
        if (!fs.existsSync(configPath)) {
            throw new Error(`配置文件不存在: ${configPath}`);
        }
        
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);
        
        console.log('✅ 配置文件加载成功');
        return config;
    } catch (error) {
        console.error(`❌ 配置文件加载失败: ${error.message}`);
        process.exit(1);
    }
}

/**
 * 验证配置
 */
function validateConfig(config) {
    const required = ['websiteUrl', 'searchData', 'selectors'];
    const missing = required.filter(key => !config[key]);
    
    if (missing.length > 0) {
        throw new Error(`配置文件缺少必需字段: ${missing.join(', ')}`);
    }
    
    if (!Array.isArray(config.searchData) || config.searchData.length === 0) {
        throw new Error('searchData 必须是非空数组');
    }
    
    const requiredSelectors = ['searchInput', 'downloadButton'];
    const missingSelectors = requiredSelectors.filter(key => !config.selectors[key]);
    
    if (missingSelectors.length > 0) {
        throw new Error(`选择器配置缺少必需字段: ${missingSelectors.join(', ')}`);
    }
    
    console.log('✅ 配置验证通过');
}

/**
 * 打印配置摘要
 */
function printConfigSummary(config) {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 Playwright自动化下载任务配置');
    console.log('='.repeat(60));
    console.log(`🌐 目标网站: ${config.websiteUrl}`);
    console.log(`📋 下载项目数量: ${config.searchData.length}`);
    console.log(`🎛️  浏览器类型: ${config.downloaderConfig?.browserType || 'chromium'}`);
    console.log(`👁️  无头模式: ${config.downloaderConfig?.headless ? '是' : '否'}`);
    console.log(`📁 下载目录: ${config.downloaderConfig?.downloadDir || './downloads'}`);
    console.log(`🔄 重试次数: ${config.downloaderConfig?.retryAttempts || 3}`);
    
    console.log('\n📋 下载项目预览:');
    const previewCount = Math.min(5, config.searchData.length);
    for (let i = 0; i < previewCount; i++) {
        console.log(`  ${i + 1}. ${config.searchData[i]}`);
    }
    if (config.searchData.length > previewCount) {
        console.log(`  ... 还有 ${config.searchData.length - previewCount} 个项目`);
    }
    
    console.log('='.repeat(60));
}

/**
 * 用户确认
 */
function getUserConfirmation() {
    return new Promise((resolve) => {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question('\n🤔 是否继续执行下载任务？(y/N): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

/**
 * 创建必要的目录
 */
function createDirectories(config) {
    const dirs = [
        config.downloaderConfig?.downloadDir || './downloads',
        './logs'
    ];
    
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 创建目录: ${dir}`);
        }
    });
}

/**
 * 主函数
 */
async function main() {
    console.log('🚀 Playwright自动化下载器启动中...');
    
    try {
        // 加载和验证配置
        const config = loadConfig();
        validateConfig(config);
        
        // 创建必要目录
        createDirectories(config);
        
        // 打印配置摘要
        printConfigSummary(config);
        
        // 用户确认（在非CI环境中）
        if (!process.env.CI && !process.argv.includes('--auto-confirm')) {
            const confirmed = await getUserConfirmation();
            if (!confirmed) {
                console.log('❌ 用户取消操作');
                process.exit(0);
            }
        }
        
        console.log('\n🎬 开始执行下载任务...');
        
        // 创建下载器实例
        const downloader = new PlaywrightDownloader(config.downloaderConfig || {});
        
        // 初始化浏览器
        await downloader.init();
        
        // 执行批量下载
        await downloader.batchDownload(
            config.websiteUrl,
            config.searchData,
            config.selectors
        );
        
        // 关闭浏览器
        await downloader.close();
        
        console.log('\n🎉 所有任务执行完成！');
        
    } catch (error) {
        console.error(`\n💥 程序执行出错: ${error.message}`);
        
        // 错误时的调试信息
        if (process.argv.includes('--debug')) {
            console.error('调试信息:', error.stack);
        }
        
        process.exit(1);
    }
}

/**
 * 处理命令行参数
 */
function handleCommandLineArgs() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🎯 Playwright自动化下载器 - 快速启动

用法:
  node quick_start_playwright.js [选项]

选项:
  --help, -h          显示帮助信息
  --auto-confirm      自动确认，跳过用户交互
  --debug             显示详细错误信息
  --config <path>     指定配置文件路径 (默认: ./playwright_config.json)

示例:
  node quick_start_playwright.js
  node quick_start_playwright.js --auto-confirm
  node quick_start_playwright.js --config ./my_config.json
`);
        process.exit(0);
    }
}

// 处理命令行参数
handleCommandLineArgs();

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('💥 未捕获的异常:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 未处理的Promise拒绝:', reason);
    process.exit(1);
});

// 优雅退出处理
process.on('SIGINT', () => {
    console.log('\n👋 接收到退出信号，正在清理...');
    process.exit(0);
});

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    loadConfig,
    validateConfig,
    printConfigSummary,
    main
};