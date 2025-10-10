# Playwright自动化下载器 - 快速开始

## 🚀 快速启动

### 1. 基本使用
```bash
# 使用默认配置启动
node quick_start_playwright.js

# 自动确认模式（适合脚本调用）
node quick_start_playwright.js --auto-confirm

# 使用自定义配置文件
node quick_start_playwright.js --config ./my_config.json
```

### 2. 配置文件
编辑 `playwright_config.json` 文件：
- `websiteUrl`: 目标网站URL
- `searchData`: 搜索关键词数组
- `selectors`: 页面元素选择器
- `downloaderConfig`: 下载器配置

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
4. 查看 `./logs/` 目录下的日志文件

### 5. 性能优化
- 设置 `headless: true` 提高速度
- 调整 `humanDelay` 减少延迟
- 使用 `disableImages: true` 节省带宽

---
生成时间: 2025/10/10 14:45:10
