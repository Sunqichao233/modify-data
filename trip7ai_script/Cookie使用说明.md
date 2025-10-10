# Cookie 登录使用说明

## 概述

您提供的Cookie信息已成功配置到系统中，现在脚本将优先使用这些Cookie进行登录，避免重复输入用户名和密码。

## 已配置的Cookie信息

```
GA1.1.140947117.1749184353  - Google Analytics Cookie
GA1.1.182599511.1739437676  - Google Analytics Cookie  
GS2.1.s1749184353$o1$g1$t1749188099$j60$l0$h0  - Google Analytics Session
GS2.1.s1760073188$o89$g1$t1760073239$j9$l0$h0  - Google Analytics Session
GA1.2.1312581103.1760055178  - Google Analytics Cookie
```

## 工作原理

1. **优先级顺序**：
   - 首先尝试使用预定义Cookie登录
   - 如果失败，尝试使用保存的Cookie文件
   - 最后回退到自动或手动登录

2. **Cookie加载流程**：
   ```
   启动脚本 → 访问登录页面 → 加载预定义Cookie → 刷新页面 → 检查登录状态
   ```

3. **登录验证**：
   - 脚本会检查页面上的登录指示器
   - 如果检测到已登录状态，跳过登录步骤
   - 如果未登录，继续执行其他登录方式

## 配置详情

在 `playwright_config.json` 中的配置：

```json
"loginConfig": {
    "enabled": true,
    "useCookies": true,
    "predefinedCookies": [
        {
            "name": "_ga",
            "value": "GA1.1.140947117.1749184353",
            "domain": ".trip7.ai",
            "path": "/"
        },
        // ... 其他Cookie
    ]
}
```

## 使用方法

1. **直接运行**：
   ```bash
   node quick_start_playwright.js
   ```

2. **查看运行日志**：
   - 脚本会显示 "🍪 加载预定义Cookie"
   - 成功时显示 "✅ 预定义Cookie登录成功"
   - 失败时会尝试其他登录方式

## 优势特点

✅ **免密登录**：无需输入用户名密码  
✅ **快速启动**：跳过登录表单填写  
✅ **稳定可靠**：基于真实的浏览器会话  
✅ **自动回退**：失败时自动尝试其他方式  

## 注意事项

⚠️ **Cookie有效期**：
- Cookie可能会过期，需要定期更新
- 如果登录失败，可能需要获取新的Cookie

⚠️ **安全性**：
- Cookie包含敏感信息，请妥善保管配置文件
- 不要在公共环境中分享配置文件

⚠️ **域名匹配**：
- Cookie已配置为 `.trip7.ai` 域名
- 确保访问的网站域名匹配

## 故障排除

### 如果Cookie登录失败

1. **检查Cookie是否过期**：
   - 在浏览器中手动访问网站
   - 检查是否仍然保持登录状态

2. **更新Cookie信息**：
   - 重新获取最新的Cookie值
   - 更新配置文件中的Cookie信息

3. **启用备用登录方式**：
   ```json
   "manualLogin": true  // 启用手动登录作为备用
   ```

### 获取新Cookie的方法

1. **浏览器开发者工具**：
   - 按F12打开开发者工具
   - 切换到 "Application" 或 "存储" 标签
   - 查看 "Cookies" 部分
   - 复制相关Cookie值

2. **网络请求头**：
   - 在 "Network" 标签中查看请求
   - 复制 "Cookie" 请求头的值

## 运行示例

```bash
$ node quick_start_playwright.js

🚀 Playwright 自动化下载器
📋 配置摘要:
   网站: https://www.trip7.ai/admin/login
   目标页面: https://www.trip7.ai/admin/watchHistory/manage
   🍪 预定义Cookie: 已配置 5 个
   💡 预定义Cookie模式：将优先使用配置的Cookie进行登录

🔐 开始处理登录...
🍪 加载预定义Cookie
🍪 已加载 5 个预定义Cookie
✅ 预定义Cookie登录成功
🔄 跳转到目标页面...
📊 开始批量下载任务...
```

现在您可以直接运行脚本，系统将自动使用您提供的Cookie信息进行登录！