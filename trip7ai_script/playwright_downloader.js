/**
 * Playwright自动化下载脚本
 * 比Selenium更稳定、速度更快的Web自动化解决方案
 */

const playwright = require('playwright');
const { chromium, firefox, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

class PlaywrightDownloader {
    constructor(config = {}) {
        this.config = {
            headless: false,
            browserType: 'chromium', // chromium, firefox, webkit
            downloadDir: './downloads',
            timeout: 30000,
            retryAttempts: 3,
            humanDelay: { min: 1000, max: 3000 },
            typingDelay: { min: 50, max: 150 },
            ...config
        };
        
        this.browser = null;
        this.context = null;
        this.downloadCount = 0;
        this.failedDownloads = [];
        this.downloadedFiles = [];
    }

    /**
     * 初始化浏览器
     */
    async init() {
        console.log('🚀 启动Playwright浏览器...');
        
        // 确保下载目录存在
        if (!fs.existsSync(this.config.downloadDir)) {
            fs.mkdirSync(this.config.downloadDir, { recursive: true });
        }

        // 选择浏览器类型
        const browserEngine = {
            chromium,
            firefox,
            webkit
        }[this.config.browserType] || chromium;

        // 启动浏览器
        this.browser = await browserEngine.launch({
            headless: this.config.headless,
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        // 创建浏览器上下文
        this.context = await this.browser.newContext({
            // 设置下载路径
            acceptDownloads: true,
            // 模拟真实用户
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            // 禁用图片加载以提高速度
            // extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' }
        });

        console.log('✅ 浏览器启动成功');
    }

    /**
     * 人类延迟模拟
     */
    async humanDelay(min = null, max = null) {
        const minDelay = min || this.config.humanDelay.min;
        const maxDelay = max || this.config.humanDelay.max;
        const delay = Math.random() * (maxDelay - minDelay) + minDelay;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * 处理登录
     */
    async handleLogin(page, loginConfig) {
        if (!loginConfig || !loginConfig.enabled) {
            console.log('⏭️  跳过登录步骤');
            return true;
        }

        console.log('🔐 开始处理登录...');
        
        try {
            // 如果有预定义的Cookie，先加载
            if (loginConfig.predefinedCookies && loginConfig.predefinedCookies.length > 0) {
                console.log('🍪 加载预定义Cookie');
                await this.loadPredefinedCookies(page, loginConfig.predefinedCookies);
                await page.reload({ waitUntil: 'networkidle' });
                await this.humanDelay(2000, 3000);
                
                // 检查预定义Cookie登录是否成功
                if (loginConfig.loggedInIndicator) {
                    const loggedInElement = await this.findElement(page, loginConfig.loggedInIndicator);
                    if (loggedInElement) {
                        console.log('✅ 预定义Cookie登录成功');
                        return true;
                    }
                }
            }
            
            // 如果有保存的Cookie，再尝试加载
            if (loginConfig.useCookies && await this.loadCookies(page)) {
                console.log('🍪 使用保存的Cookie登录');
                await page.reload({ waitUntil: 'networkidle' });
                await this.humanDelay(2000, 3000);
                
                // 检查Cookie登录是否成功
                if (loginConfig.loggedInIndicator) {
                    const loggedInElement = await this.findElement(page, loginConfig.loggedInIndicator);
                    if (loggedInElement) {
                        console.log('✅ Cookie登录成功');
                        return true;
                    }
                }
            }
            
            // 等待登录页面加载
            await this.humanDelay(2000, 3000);
            
            // 检查是否已经登录（通过检查特定元素）
            if (loginConfig.loggedInIndicator) {
                const loggedInElement = await this.findElement(page, loginConfig.loggedInIndicator);
                if (loggedInElement) {
                    console.log('✅ 已经登录，跳过登录步骤');
                    return true;
                }
            }
            
            // 如果启用了手动登录模式
            if (loginConfig.manualLogin) {
                console.log('🖐️  手动登录模式已启用');
                console.log('请在浏览器中手动完成登录，然后按任意键继续...');
                
                // 等待用户手动登录
                await this.waitForManualLogin(page, loginConfig);
                
                // 保存Cookie以供下次使用
                if (loginConfig.useCookies) {
                    await this.saveCookies(page);
                }
                
                return true;
            }
            
            // 自动登录流程
            return await this.performAutoLogin(page, loginConfig);
            
        } catch (error) {
            console.error('❌ 登录失败:', error.message);
            console.log('💡 建议：');
            console.log('1. 启用手动登录模式：在配置中设置 "manualLogin": true');
            console.log('2. 启用Cookie保存：在配置中设置 "useCookies": true');
            console.log('3. 检查登录页面元素选择器是否正确');
            return false;
        }
    }
    
    /**
     * 执行自动登录
     */
    async performAutoLogin(page, loginConfig) {
        // 查找用户名输入框
        const usernameInput = await this.findElement(page, loginConfig.usernameSelector);
        if (!usernameInput) {
            throw new Error('未找到用户名输入框');
        }
        
        // 输入用户名
        console.log('⌨️  输入用户名');
        await this.humanType(page, usernameInput, loginConfig.username);
        await this.humanDelay(500, 1000);
        
        // 查找密码输入框
        const passwordInput = await this.findElement(page, loginConfig.passwordSelector);
        if (!passwordInput) {
            throw new Error('未找到密码输入框');
        }
        
        // 输入密码
        console.log('🔑 输入密码');
        await this.humanType(page, passwordInput, loginConfig.password);
        await this.humanDelay(500, 1000);
        
        // 点击登录按钮
        const loginButton = await this.findElement(page, loginConfig.loginButtonSelector);
        if (!loginButton) {
            throw new Error('未找到登录按钮');
        }
        
        console.log('🚀 点击登录按钮');
        await loginButton.click();
        
        // 等待登录完成
        await this.humanDelay(3000, 5000);
        
        // 验证登录是否成功
        if (loginConfig.loggedInIndicator) {
            const loggedInElement = await this.findElement(page, loginConfig.loggedInIndicator);
            if (loggedInElement) {
                console.log('✅ 自动登录成功');
                
                // 保存Cookie以供下次使用
                if (loginConfig.useCookies) {
                    await this.saveCookies(page);
                }
                
                return true;
            } else {
                throw new Error('登录验证失败');
            }
        }
        
        console.log('✅ 登录完成');
        return true;
    }
    
    /**
     * 等待手动登录完成
     */
    async waitForManualLogin(page, loginConfig) {
        console.log('⏳ 等待手动登录完成...');
        console.log('📋 请在浏览器中完成以下操作：');
        console.log('   1. 输入用户名和密码');
        console.log('   2. 处理验证码（如有）');
        console.log('   3. 点击登录按钮');
        console.log('   4. 等待页面跳转或出现用户信息');
        console.log('💡 脚本会自动检测登录状态，无需手动操作');
        
        // 等待登录成功的指示器出现
        let loginSuccess = false;
        let attempts = 0;
        const maxAttempts = 120; // 最多等待10分钟
        const initialUrl = page.url();
        
        while (!loginSuccess && attempts < maxAttempts) {
            await this.humanDelay(3000, 3000); // 每3秒检查一次
            attempts++;
            
            try {
                // 方法1: 检查登录成功指示器
                if (loginConfig.loggedInIndicator) {
                    const loggedInElement = await this.findElement(page, loginConfig.loggedInIndicator);
                    if (loggedInElement) {
                        loginSuccess = true;
                        console.log('✅ 检测到登录成功指示器');
                        break;
                    }
                }
                
                // 方法2: 检查URL变化（离开登录页面）
                const currentUrl = page.url();
                if (!currentUrl.includes('login') && currentUrl !== initialUrl) {
                    loginSuccess = true;
                    console.log('✅ 检测到页面跳转，登录成功');
                    break;
                }
                
                // 方法3: 检查页面标题变化
                const pageTitle = await page.title();
                if (pageTitle && !pageTitle.toLowerCase().includes('login') && !pageTitle.toLowerCase().includes('登录')) {
                    // 进一步验证是否真的登录成功
                    await this.humanDelay(2000, 2000);
                    const newUrl = page.url();
                    if (!newUrl.includes('login')) {
                        loginSuccess = true;
                        console.log('✅ 检测到页面标题变化，登录成功');
                        break;
                    }
                }
                
                // 方法4: 检查是否出现用户相关元素
                const userElements = [
                    '.user-info', '.user-name', '.username', '.user-avatar',
                    '[data-testid="user-menu"]', '.logout', '.dashboard',
                    '.profile', '.account', '.user-dropdown'
                ];
                
                for (const selector of userElements) {
                    const element = await this.findElement(page, selector);
                    if (element) {
                        loginSuccess = true;
                        console.log(`✅ 检测到用户元素 ${selector}，登录成功`);
                        break;
                    }
                }
                
                if (loginSuccess) break;
                
                // 方法5: 检查Cookie变化
                const cookies = await page.context().cookies();
                const sessionCookies = cookies.filter(cookie => 
                    cookie.name.toLowerCase().includes('session') || 
                    cookie.name.toLowerCase().includes('token') ||
                    cookie.name.toLowerCase().includes('auth')
                );
                
                if (sessionCookies.length > 0) {
                    // 有会话Cookie，可能已登录，再次验证
                    await this.humanDelay(2000, 2000);
                    const finalUrl = page.url();
                    if (!finalUrl.includes('login')) {
                        loginSuccess = true;
                        console.log('✅ 检测到会话Cookie且页面已跳转，登录成功');
                        break;
                    }
                }
                
            } catch (error) {
                console.warn(`⚠️  登录检测过程中出现错误: ${error.message}`);
            }
            
            // 定期提示
            if (attempts % 10 === 0) { // 每30秒提示一次
                const elapsed = attempts * 3;
                console.log(`⏳ 仍在等待登录完成... (已等待 ${elapsed} 秒)`);
                console.log(`💡 提示: 请确保在浏览器中完成登录操作`);
            }
        }
        
        if (!loginSuccess) {
            console.error('❌ 手动登录检测超时');
            console.log('💡 可能的原因：');
            console.log('   1. 登录页面元素选择器不正确');
            console.log('   2. 登录后页面没有明显变化');
            console.log('   3. 网络延迟或页面加载缓慢');
            console.log('   4. 登录失败但页面没有明确提示');
            throw new Error('手动登录超时，请检查登录状态和配置');
        }
        
        // 登录成功后等待页面稳定
        console.log('⏳ 等待页面稳定...');
        await this.humanDelay(3000, 5000);
        console.log('✅ 手动登录检测完成，继续执行后续操作');
    }
    
    /**
     * 保存Cookie
     */
    async saveCookies(page) {
        try {
            const cookies = await page.context().cookies();
            const cookiesPath = path.join(this.config.downloadDir, '../cookies.json');
            fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
            console.log('🍪 Cookie已保存');
        } catch (error) {
            console.warn('⚠️  Cookie保存失败:', error.message);
        }
    }
    
    /**
     * 加载Cookie
     */
    async loadCookies(page) {
        try {
            const cookiesPath = path.join(this.config.downloadDir, '../cookies.json');
            if (fs.existsSync(cookiesPath)) {
                const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
                await page.context().addCookies(cookies);
                console.log('🍪 Cookie已加载');
                return true;
            }
        } catch (error) {
            console.warn('⚠️  Cookie加载失败:', error.message);
        }
        return false;
    }
    
    /**
     * 加载预定义Cookie
     */
    async loadPredefinedCookies(page, predefinedCookies) {
        try {
            // 格式化Cookie数据
            const formattedCookies = predefinedCookies.map(cookie => ({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain || '.trip7.ai',
                path: cookie.path || '/',
                httpOnly: cookie.httpOnly || false,
                secure: cookie.secure || false,
                sameSite: cookie.sameSite || 'Lax'
            }));
            
            await page.context().addCookies(formattedCookies);
            console.log(`🍪 已加载 ${formattedCookies.length} 个预定义Cookie`);
            return true;
        } catch (error) {
            console.warn('⚠️  预定义Cookie加载失败:', error.message);
            return false;
        }
    }

    /**
     * 人类打字模拟
     */
    async humanType(page, selector, text, options = {}) {
        const element = await page.locator(selector);
        
        // 清空输入框
        if (options.clear !== false) {
            await element.clear();
            await this.humanDelay(200, 500);
        }

        // 逐字符输入
        for (const char of text) {
            await element.type(char);
            const typingDelay = Math.random() * 
                (this.config.typingDelay.max - this.config.typingDelay.min) + 
                this.config.typingDelay.min;
            await new Promise(resolve => setTimeout(resolve, typingDelay));
        }
    }

    /**
     * 智能元素查找
     */
    async findElement(page, selectors) {
        for (const [type, selector] of Object.entries(selectors)) {
            try {
                let locator;
                switch (type) {
                    case 'id':
                        locator = page.locator(`#${selector}`);
                        break;
                    case 'css':
                        locator = page.locator(selector);
                        break;
                    case 'xpath':
                        locator = page.locator(`xpath=${selector}`);
                        break;
                    case 'text':
                        locator = page.getByText(selector);
                        break;
                    case 'placeholder':
                        locator = page.getByPlaceholder(selector);
                        break;
                    case 'role':
                        locator = page.getByRole(selector.role, { name: selector.name });
                        break;
                    default:
                        continue;
                }

                // 检查元素是否存在且可见
                await locator.waitFor({ state: 'visible', timeout: 5000 });
                console.log(`✅ 找到元素: ${type}=${JSON.stringify(selector)}`);
                return locator;
            } catch (error) {
                continue;
            }
        }
        
        console.log('❌ 未找到任何匹配的元素');
        return null;
    }

    /**
     * 设置下载监听
     */
    async setupDownloadListener(page, expectedFileName = null) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('下载超时'));
            }, this.config.timeout);

            page.on('download', async (download) => {
                try {
                    clearTimeout(timeout);
                    
                    // 获取原始文件名
                    const originalName = download.suggestedFilename();
                    
                    // 生成新文件名（如果需要）
                    const fileName = expectedFileName || 
                        `download_${Date.now()}_${originalName}`;
                    
                    const filePath = path.join(this.config.downloadDir, fileName);
                    
                    // 保存文件
                    await download.saveAs(filePath);
                    
                    console.log(`📥 文件下载成功: ${fileName}`);
                    this.downloadedFiles.push({
                        originalName,
                        fileName,
                        filePath,
                        downloadTime: new Date().toISOString()
                    });
                    
                    resolve(filePath);
                } catch (error) {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
        });
    }

    /**
     * 批量下载
     */
    async batchDownload(websiteUrl, searchData, selectors, loginConfig = null, targetUrl = null) {
        console.log(`🎯 开始批量下载任务，共${searchData.length}个项目`);
        
        const page = await this.context.newPage();
        
        try {
            // 访问登录页面
            console.log(`🌐 访问登录页面: ${websiteUrl}`);
            await page.goto(websiteUrl, { waitUntil: 'networkidle' });
            await this.humanDelay(2000, 4000);
            
            // 处理登录
            const loginSuccess = await this.handleLogin(page, loginConfig);
            if (loginConfig && loginConfig.enabled && !loginSuccess) {
                throw new Error('登录失败，无法继续执行下载任务');
            }
            
            // 登录成功后跳转到目标页面
            if (targetUrl && targetUrl !== websiteUrl) {
                console.log(`🔄 跳转到目标页面: ${targetUrl}`);
                await page.goto(targetUrl, { waitUntil: 'networkidle' });
                await this.humanDelay(2000, 4000);
            }

            for (let i = 0; i < searchData.length; i++) {
                const searchItem = searchData[i];
                console.log(`\n📋 处理第${i + 1}/${searchData.length}项: ${searchItem}`);
                
                let success = false;
                
                for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
                    try {
                        if (attempt > 0) {
                            console.log(`🔄 第${attempt + 1}次重试`);
                            await this.humanDelay(2000, 4000);
                        }

                        // 查找搜索框
                        const searchBox = await this.findElement(page, selectors.searchInput);
                        if (!searchBox) {
                            throw new Error('未找到搜索框');
                        }

                        // 输入搜索内容
                        console.log(`⌨️  输入搜索内容: ${searchItem}`);
                        await this.humanType(page, searchBox, searchItem);
                        await this.humanDelay(500, 1500);

                        // 提交搜索（按回车或点击搜索按钮）
                        if (selectors.searchButton) {
                            const searchButton = await this.findElement(page, selectors.searchButton);
                            if (searchButton) {
                                await searchButton.click();
                            } else {
                                await page.keyboard.press('Enter');
                            }
                        } else {
                            await page.keyboard.press('Enter');
                        }
                        
                        console.log('🔍 提交搜索');
                        
                        // 等待搜索结果加载
                        await this.humanDelay(3000, 6000);
                        
                        // 随机滚动页面
                        await page.evaluate(() => {
                            window.scrollBy(0, Math.random() * 500 + 100);
                        });
                        await this.humanDelay(500, 1000);

                        // 查找下载按钮
                        const downloadButton = await this.findElement(page, selectors.downloadButton);
                        if (!downloadButton) {
                            throw new Error('未找到下载按钮');
                        }

                        // 设置下载监听
                        const expectedFileName = `${searchItem.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.csv`;
                        const downloadPromise = this.setupDownloadListener(page, expectedFileName);

                        // 点击下载按钮
                        console.log('⬇️  点击下载按钮');
                        await downloadButton.click();

                        // 等待下载完成
                        await downloadPromise;
                        
                        this.downloadCount++;
                        success = true;
                        console.log(`✅ 下载成功: ${searchItem}`);
                        break;
                        
                    } catch (error) {
                        console.log(`❌ 处理项目 '${searchItem}' 时出错 (尝试${attempt + 1}): ${error.message}`);
                        if (attempt < this.config.retryAttempts - 1) {
                            await this.humanDelay(2000, 5000);
                        }
                    }
                }

                if (!success) {
                    this.failedDownloads.push(searchItem);
                    console.log(`❌ 下载失败: ${searchItem}`);
                }

                // 项目间延迟
                if (i < searchData.length - 1) {
                    await this.humanDelay(3000, 8000);
                }
            }
            
        } catch (error) {
            console.error(`💥 批量下载过程中出现严重错误: ${error.message}`);
        } finally {
            await page.close();
            this.printSummary();
        }
    }

    /**
     * 打印下载统计
     */
    printSummary() {
        const total = this.downloadCount + this.failedDownloads.length;
        console.log('\n' + '='.repeat(50));
        console.log('📊 下载统计');
        console.log('='.repeat(50));
        console.log(`总计: ${total}`);
        console.log(`成功: ${this.downloadCount}`);
        console.log(`失败: ${this.failedDownloads.length}`);
        
        if (this.failedDownloads.length > 0) {
            console.log(`失败项目: ${this.failedDownloads.join(', ')}`);
        }
        
        if (this.downloadedFiles.length > 0) {
            console.log('\n📁 已下载文件:');
            this.downloadedFiles.forEach((file, index) => {
                console.log(`  ${index + 1}. ${file.fileName}`);
            });
        }
        
        console.log('='.repeat(50));
    }

    /**
     * 关闭浏览器
     */
    async close() {
        if (this.context) {
            await this.context.close();
        }
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 浏览器已关闭');
        }
    }
}

/**
 * 创建示例配置
 */
function createSampleConfig() {
    return {
        websiteUrl: 'https://example.com',
        searchData: [
            'user001#Java基础',
            'user002#Python入门',
            'user003#数据结构与算法',
            'user004#Web前端开发',
            'user005#数据库设计'
        ],
        selectors: {
            searchInput: {
                id: 'searchInput',
                css: 'input[type="search"]',
                xpath: '//input[@placeholder="搜索"]',
                placeholder: '搜索'
            },
            searchButton: {
                id: 'searchButton',
                css: 'button[type="submit"]',
                xpath: '//button[contains(text(), "搜索")]',
                text: '搜索'
            },
            downloadButton: {
                id: 'downloadCsvBtn',
                css: 'button[class*="download"]',
                xpath: '//button[contains(text(), "下载") or contains(text(), "Download")]',
                text: '下载CSV',
                role: { role: 'button', name: '下载' }
            }
        }
    };
}

/**
 * 主函数
 */
async function main() {
    const config = createSampleConfig();
    
    // 自定义下载器配置
    const downloaderConfig = {
        headless: false,  // 设为true可无头运行
        browserType: 'chromium',  // chromium, firefox, webkit
        downloadDir: './downloads',
        timeout: 30000,
        retryAttempts: 2,
        humanDelay: { min: 1000, max: 3000 },
        typingDelay: { min: 50, max: 120 }
    };
    
    const downloader = new PlaywrightDownloader(downloaderConfig);
    
    try {
        await downloader.init();
        
        await downloader.batchDownload(
            config.websiteUrl,
            config.searchData,
            config.selectors
        );
        
    } catch (error) {
        console.error(`💥 程序执行出错: ${error.message}`);
    } finally {
        await downloader.close();
    }
}

// 导出类和函数
module.exports = {
    PlaywrightDownloader,
    createSampleConfig,
    main
};

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}