/**
 * Playwright自动化下载器 - 环境设置脚本
 * 自动安装依赖和配置环境
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class PlaywrightSetup {
    constructor() {
        this.isWindows = os.platform() === 'win32';
        this.nodeVersion = process.version;
        this.setupSteps = [];
        this.errors = [];
    }

    /**
     * 打印欢迎信息
     */
    printWelcome() {
        console.log('\n' + '='.repeat(70));
        console.log('🎭 Playwright自动化下载器 - 环境设置');
        console.log('='.repeat(70));
        console.log('🚀 正在为您配置Playwright自动化环境...');
        console.log(`💻 操作系统: ${os.platform()} ${os.arch()}`);
        console.log(`📦 Node.js版本: ${this.nodeVersion}`);
        console.log('='.repeat(70));
    }

    /**
     * 检查Node.js版本
     */
    checkNodeVersion() {
        console.log('\n🔍 检查Node.js版本...');
        
        const majorVersion = parseInt(this.nodeVersion.slice(1).split('.')[0]);
        
        if (majorVersion < 16) {
            throw new Error(`Node.js版本过低 (当前: ${this.nodeVersion})，需要 >= 16.0.0`);
        }
        
        console.log('✅ Node.js版本检查通过');
        this.setupSteps.push('Node.js版本检查');
    }

    /**
     * 检查npm可用性
     */
    checkNpm() {
        console.log('\n🔍 检查npm可用性...');
        
        try {
            const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
            console.log(`✅ npm版本: ${npmVersion}`);
            this.setupSteps.push('npm可用性检查');
        } catch (error) {
            throw new Error('npm不可用，请确保已正确安装Node.js');
        }
    }

    /**
     * 安装npm依赖
     */
    async installDependencies() {
        console.log('\n📦 安装项目依赖...');
        
        try {
            // 检查package.json是否存在
            if (!fs.existsSync('./package.json')) {
                console.log('⚠️  package.json不存在，跳过依赖安装');
                return;
            }
            
            console.log('⏳ 正在安装npm包...');
            execSync('npm install', { 
                stdio: 'inherit',
                cwd: process.cwd()
            });
            
            console.log('✅ npm依赖安装完成');
            this.setupSteps.push('npm依赖安装');
            
        } catch (error) {
            throw new Error(`npm依赖安装失败: ${error.message}`);
        }
    }

    /**
     * 安装Playwright浏览器
     */
    async installPlaywrightBrowsers() {
        console.log('\n🌐 安装Playwright浏览器...');
        
        try {
            console.log('⏳ 正在下载浏览器文件（可能需要几分钟）...');
            
            // 安装所有浏览器
            execSync('npx playwright install', { 
                stdio: 'inherit',
                cwd: process.cwd()
            });
            
            console.log('✅ Playwright浏览器安装完成');
            this.setupSteps.push('Playwright浏览器安装');
            
        } catch (error) {
            console.log('⚠️  完整浏览器安装失败，尝试仅安装Chromium...');
            
            try {
                execSync('npx playwright install chromium', { 
                    stdio: 'inherit',
                    cwd: process.cwd()
                });
                
                console.log('✅ Chromium浏览器安装完成');
                this.setupSteps.push('Chromium浏览器安装');
                
            } catch (chromiumError) {
                throw new Error(`浏览器安装失败: ${chromiumError.message}`);
            }
        }
    }

    /**
     * 创建必要目录
     */
    createDirectories() {
        console.log('\n📁 创建项目目录...');
        
        const directories = [
            './downloads',
            './logs',
            './config',
            './screenshots'
        ];
        
        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`✅ 创建目录: ${dir}`);
            } else {
                console.log(`📁 目录已存在: ${dir}`);
            }
        });
        
        this.setupSteps.push('项目目录创建');
    }

    /**
     * 测试Playwright安装
     */
    async testPlaywrightInstallation() {
        console.log('\n🧪 测试Playwright安装...');
        
        try {
            // 创建简单的测试脚本
            const testScript = `
const { chromium } = require('playwright');

(async () => {
    try {
        console.log('启动浏览器测试...');
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto('https://example.com');
        const title = await page.title();
        console.log('页面标题:', title);
        await browser.close();
        console.log('✅ Playwright测试成功');
        process.exit(0);
    } catch (error) {
        console.error('❌ Playwright测试失败:', error.message);
        process.exit(1);
    }
})();
`;
            
            fs.writeFileSync('./test_playwright_temp.js', testScript);
            
            execSync('node test_playwright_temp.js', { 
                stdio: 'inherit',
                timeout: 30000
            });
            
            // 清理测试文件
            if (fs.existsSync('./test_playwright_temp.js')) {
                fs.unlinkSync('./test_playwright_temp.js');
            }
            
            console.log('✅ Playwright功能测试通过');
            this.setupSteps.push('Playwright功能测试');
            
        } catch (error) {
            // 清理测试文件
            if (fs.existsSync('./test_playwright_temp.js')) {
                fs.unlinkSync('./test_playwright_temp.js');
            }
            
            console.log('⚠️  Playwright测试失败，但安装可能仍然成功');
            console.log('💡 您可以稍后手动测试功能');
        }
    }

    /**
     * 生成使用指南
     */
    generateUsageGuide() {
        console.log('\n📖 生成使用指南...');
        
        const guide = `# Playwright自动化下载器 - 快速开始

## 🚀 快速启动

### 1. 基本使用
\`\`\`bash
# 使用默认配置启动
node quick_start_playwright.js

# 自动确认模式（适合脚本调用）
node quick_start_playwright.js --auto-confirm

# 使用自定义配置文件
node quick_start_playwright.js --config ./my_config.json
\`\`\`

### 2. 配置文件
编辑 \`playwright_config.json\` 文件：
- \`websiteUrl\`: 目标网站URL
- \`searchData\`: 搜索关键词数组
- \`selectors\`: 页面元素选择器
- \`downloaderConfig\`: 下载器配置

### 3. 高级功能
- 🎭 多浏览器支持 (Chromium, Firefox, WebKit)
- 🤖 人类行为模拟 (随机延迟、打字速度)
- 🔄 自动重试机制
- 📁 智能文件命名
- 📊 详细下载统计

### 4. 故障排除
如果遇到问题：
1. 检查网络连接
2. 确认目标网站可访问
3. 验证选择器配置
4. 查看 \`./logs/\` 目录下的日志文件

### 5. 性能优化
- 设置 \`headless: true\` 提高速度
- 调整 \`humanDelay\` 减少延迟
- 使用 \`disableImages: true\` 节省带宽

---
生成时间: ${new Date().toLocaleString()}
`;
        
        fs.writeFileSync('./PLAYWRIGHT_GUIDE.md', guide);
        console.log('✅ 使用指南已生成: PLAYWRIGHT_GUIDE.md');
        this.setupSteps.push('使用指南生成');
    }

    /**
     * 打印设置完成信息
     */
    printCompletionInfo() {
        console.log('\n' + '='.repeat(70));
        console.log('🎉 Playwright环境设置完成！');
        console.log('='.repeat(70));
        
        console.log('\n✅ 完成的设置步骤:');
        this.setupSteps.forEach((step, index) => {
            console.log(`  ${index + 1}. ${step}`);
        });
        
        if (this.errors.length > 0) {
            console.log('\n⚠️  遇到的问题:');
            this.errors.forEach((error, index) => {
                console.log(`  ${index + 1}. ${error}`);
            });
        }
        
        console.log('\n🚀 后续步骤:');
        console.log('  1. 编辑 playwright_config.json 配置文件');
        console.log('  2. 运行: node quick_start_playwright.js');
        console.log('  3. 查看下载结果在 ./downloads/ 目录');
        
        console.log('\n📚 更多信息:');
        console.log('  - 查看 PLAYWRIGHT_GUIDE.md 获取详细使用说明');
        console.log('  - 访问 https://playwright.dev/ 了解更多Playwright功能');
        
        console.log('\n' + '='.repeat(70));
    }

    /**
     * 执行完整设置
     */
    async runSetup() {
        try {
            this.printWelcome();
            
            this.checkNodeVersion();
            this.checkNpm();
            
            await this.installDependencies();
            await this.installPlaywrightBrowsers();
            
            this.createDirectories();
            await this.testPlaywrightInstallation();
            this.generateUsageGuide();
            
            this.printCompletionInfo();
            
        } catch (error) {
            console.error(`\n💥 设置过程中出现错误: ${error.message}`);
            console.log('\n🔧 可能的解决方案:');
            console.log('  1. 检查网络连接');
            console.log('  2. 确保有足够的磁盘空间');
            console.log('  3. 以管理员权限运行');
            console.log('  4. 手动安装: npm install && npx playwright install');
            
            process.exit(1);
        }
    }
}

/**
 * 主函数
 */
async function main() {
    const setup = new PlaywrightSetup();
    await setup.runSetup();
}

// 处理命令行参数
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🎭 Playwright自动化下载器 - 环境设置

用法:
  node setup_playwright.js [选项]

选项:
  --help, -h    显示帮助信息

功能:
  ✅ 检查Node.js版本
  ✅ 安装npm依赖
  ✅ 下载Playwright浏览器
  ✅ 创建项目目录
  ✅ 测试安装结果
  ✅ 生成使用指南
`);
    process.exit(0);
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { PlaywrightSetup };