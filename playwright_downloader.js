/**
 * Playwright自动化下载脚本
 * 比Selenium更稳定、速度更快的Web自动化解决方案
 */

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
    async batchDownload(websiteUrl, searchData, selectors) {
        console.log(`🎯 开始批量下载任务，共${searchData.length}个项目`);
        
        const page = await this.context.newPage();
        
        try {
            // 访问网站
            console.log(`🌐 访问网站: ${websiteUrl}`);
            await page.goto(websiteUrl, { waitUntil: 'networkidle' });
            await this.humanDelay(2000, 4000);

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