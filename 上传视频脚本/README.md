# 上传视频脚本说明（Playwright）

## 1. 为什么选择 Playwright
上传流程包含以下特点：
- 需要自动登录后台并处理跳转（`/user/login`、`/admin/login`、`/school/manage`、`/school/save`）。
- 需要操作真实网页控件（下拉框、富文本、文件上传、提交按钮）。
- 需要直接使用本地文件（图片、视频、CSV），并批量循环执行。
- 需要稳定的调试能力（截图、HTML导出、请求失败日志）。

与“浏览器控制台粘贴脚本”相比，Playwright 更适合这类流程自动化：
- 可直接读取本地文件，不受页面 `showDirectoryPicker` 的用户手势限制。
- 可脚本化处理登录、页面跳转、等待时序、失败重试。
- 具备更强的诊断能力，便于定位“页面未渲染/上传失败/按钮找不到”等问题。

---

## 2. 环境搭建

### 2.1 基础环境
- Windows + PowerShell
- Node.js：最新的 20.x、22.x 或 24.x。

检查版本：
```powershell
node --version
npm --version
```

### 2.2 安装依赖
在仓库根目录执行：
```powershell
npm install playwright
```

> 脚本文件：`上传视频脚本/trip7ai_upload_videos_playwright.js`

---

## 3. 目录与数据准备

目录约定（脚本默认）：
```text
上传视频脚本/
  trip7ai_upload_videos_playwright.js
  video.csv
  images/
  videos/
  debug/
```

- `video.csv`：上传任务清单
- `images/`：图片文件（如 `1.png`）
- `videos/`：视频文件（如 `encoded_1-1.MP4`）
- `debug/`：脚本失败时自动保存诊断文件（截图、HTML、元信息）

### 3.0 准备流程总览
实际执行前，建议按这个顺序准备：
1. 准备课程表（截图/表格）并生成 `video.csv`
2. 准备封面图片并放入 `images/`
3. 准备视频文件并放入 `videos/`
4. 对照 `video.csv` 做一次文件名校验

### 3.1 CSV 固定表头
```csv
category,title,subtitle,standard_viewing_time,upload_enabled,image_path,video_path,introduction
```

### 3.2 准备数据（video.csv）
按你的规则从“左侧分类 + 右侧条目编号”表格生成，每个右侧条目一行。

核心映射：
- `category`：左侧文本去掉最后数字
- `title/subtitle/introduction`：右侧文本去掉最后编号
- `standard_viewing_time`：固定 `30`
- `upload_enabled`：固定 `する`
- `image_path`：根据左侧数字（或你当前统一策略）填入图片名
- `video_path`：根据右侧编号填入视频名

你当前项目里常用约定：
- `standard_viewing_time` 固定 `30`
- `upload_enabled` 固定 `する`
- `image_path` 通常统一 `1.png`
- `video_path` 已改为 `encoded_...` 格式（例如 `encoded_1-1.MP4`）

### 3.3 准备封面（images）
将封面图片放入 `上传视频脚本/images/`。

命名要求：
- 文件名必须与 `video.csv` 的 `image_path` 完全一致
- 示例：`image_path=1.png` 时，目录中必须存在 `images/1.png`

建议：
- 统一使用 `png`
- 避免中文空格与全角符号
- 文件名大小写保持一致（脚本按字符串匹配）

### 3.4 准备视频（videos）
将视频文件放入 `上传视频脚本/videos/`。

命名要求：
- 文件名必须与 `video.csv` 的 `video_path` 完全一致
- 当前常用格式：`encoded_1-1.MP4`
- 示例：`video_path=encoded_3-7.MP4` 时，目录中必须存在 `videos/encoded_3-7.MP4`

建议：
- 批量转码后再统一命名，避免上传阶段失败
- 后缀统一（推荐全 `.MP4`）
- 不要混用 `-`、`_`、全角字符

### 3.5 开跑前检查清单
- `video.csv` 表头与列顺序正确
- `images/` 中所有 `image_path` 文件都存在
- `videos/` 中所有 `video_path` 文件都存在
- 当前账号可访问 `https://www.trip7.ai/school/manage`
- 网络可稳定访问站点与对象存储（S3）

可选快速检查（PowerShell）：
```powershell
$base = "c:\Users\user\Desktop\modify-data\上传视频脚本"
$rows = Import-Csv "$base\video.csv"
$missingImg = $rows | Where-Object { -not (Test-Path "$base\images\$($_.image_path)") }
$missingVid = $rows | Where-Object { -not (Test-Path "$base\videos\$($_.video_path)") }
"missing images: $($missingImg.Count)"
"missing videos: $($missingVid.Count)"
```

---

## 4. 如何使用脚本

在仓库根目录运行：
```powershell
node 上传视频脚本/trip7ai_upload_videos_playwright.js
```

脚本默认配置：
- 管理页：`https://www.trip7.ai/school/manage`
- 上传页：`https://www.trip7.ai/school/save`
- 登录账号：`trip777admin`
- 登录密码：`Trip7Trip7`

如需覆盖，可用环境变量：
```powershell
$env:TRIP7_MANAGE_URL="https://www.trip7.ai/school/manage"
$env:TRIP7_UPLOAD_URL="https://www.trip7.ai/school/save"
$env:TRIP7_LOGIN_USER="trip777admin"
$env:TRIP7_LOGIN_PASSWORD="Trip7Trip7"
node 上传视频脚本/trip7ai_upload_videos_playwright.js
```

---

## 5. 脚本执行流程
1. 读取 `video.csv`。
2. 打开后台管理页（`/school/manage`）。
3. 自动登录（必要时尝试多次）。
4. 点击“コース追加”，进入上传页。
5. 按当前行填写：
   - 分类（下拉框，支持包含匹配）
   - 标题/副标题/介绍
   - 图片和视频文件
6. 选完视频后固定等待一段时间（脚本内已设置）。
7. 检查上传相关请求状态，确认未失败后提交。
8. 等待成功提示。
9. 若页面跳回 `manage`，自动进入下一条并重复步骤 4~8。

---

## 6. 常见问题与排查

### 6.1 找不到按钮/控件
- 原因：页面结构变更或未正确跳转到目标页。
- 处理：查看 `debug/` 下最新 `.png/.html/.txt`，确认当前页面实际 DOM。

### 6.2 上传太快提交 / 提交后无成功提示
- 先确认上传请求是否失败（终端会打印 `requestfailed`）。
- 若是上传失败，先排查视频文件是否存在、文件名是否匹配、网络是否稳定。

### 6.3 文件找不到
- 检查 `video.csv` 的 `image_path` / `video_path` 是否与 `images/`、`videos/` 内文件完全一致（含大小写与后缀）。

### 6.4 页面一直转圈
- 脚本会持续等待关键元素和网络状态。
- 若仍超时，`debug/` 里会有诊断输出，优先看 `*-upload-form-timeout.*` 与 `*-upload-request-failed.*`。

---

## 7. 维护建议
- 每次更新课程表后，先只跑 `video.csv` 的前 1~2 条做冒烟验证。
- 若后台文案变化（如“提交”按钮文本变化），同步更新脚本里的文本匹配配置。
- 保留 `debug/` 目录，便于快速回溯失败场景。
