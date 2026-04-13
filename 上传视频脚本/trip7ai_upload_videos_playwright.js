const fs = require("fs");
const path = require("path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  console.error("Missing playwright. Run: npm install playwright");
  process.exit(1);
}

const CONFIG = {
  manageUrl: process.env.TRIP7_MANAGE_URL || "https://www.trip7.ai/school/manage",
  startUrl: process.env.TRIP7_UPLOAD_URL || "https://www.trip7.ai/school/save",
  csvPath: path.join(__dirname, "video.csv"),
  imageRoot: path.join(__dirname, "images"),
  videoRoot: path.join(__dirname, "videos"),
  debugDir: path.join(__dirname, "debug"),
  loginUser: process.env.TRIP7_LOGIN_USER || "trip777admin",
  loginPassword: process.env.TRIP7_LOGIN_PASSWORD || "Trip7Trip7",
  headless: false,
  slowMo: 120,
  defaultTimeoutMs: 15000,
  uploadTimeoutMs: 10 * 60 * 1000,
  successTimeoutMs: 90000,
  afterSuccessWaitMs: 2500,
  manualLoginFallback: true,
  maxAutoLoginAttempts: 3,
  loginDetectionWindowMs: 20000,
  fileInputOrder: { image: 0, video: 1 },
  addCourseTexts: ["コース追加", "追加", "新規作成", "作成"],
  submitTexts: ["登録", "作成", "保存", "追加", "送信", "提交"],
  successTexts: ["保存しました", "登録しました", "作成しました", "成功", "完了"],
  busyTexts: ["アップロード中", "処理中", "変換中", "uploading", "transcoding"]
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureDebugDir() {
  fs.mkdirSync(CONFIG.debugDir, { recursive: true });
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function dumpPageDiagnostics(page, reason) {
  ensureDebugDir();
  const stamp = nowStamp();
  const screenshotPath = path.join(CONFIG.debugDir, `${stamp}-${reason}.png`);
  const htmlPath = path.join(CONFIG.debugDir, `${stamp}-${reason}.html`);
  const metaPath = path.join(CONFIG.debugDir, `${stamp}-${reason}.txt`);

  const url = page.url();
  const title = await page.title().catch(() => "");
  const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
  const categoryCount = await page.locator('select, [role="combobox"], input[role="combobox"]').count().catch(() => 0);
  const textInputCount = await page.locator('input[type="text"], input:not([type]), textarea').count().catch(() => 0);
  const fileInputCount = await page.locator('input[type="file"]').count().catch(() => 0);

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => "");
  fs.writeFileSync(htmlPath, html, "utf8");
  fs.writeFileSync(
    metaPath,
    [
      `reason=${reason}`,
      `url=${url}`,
      `title=${title}`,
      `categoryCount=${categoryCount}`,
      `textInputCount=${textInputCount}`,
      `fileInputCount=${fileInputCount}`,
      `bodyPreview=${bodyText.slice(0, 4000)}`
    ].join("\n"),
    "utf8"
  );

  console.error(`Diagnostics saved: ${screenshotPath}`);
  console.error(`Diagnostics saved: ${htmlPath}`);
  console.error(`Diagnostics saved: ${metaPath}`);
}

function attachPageDebugHooks(page) {
  page.on("console", msg => {
    const type = msg.type();
    if (["error", "warning"].includes(type)) {
      console.error(`[browser:${type}] ${msg.text()}`);
    }
  });

  page.on("pageerror", error => {
    console.error(`[pageerror] ${error.message}`);
  });

  page.on("requestfailed", request => {
    const failure = request.failure();
    console.error(`[requestfailed] ${request.method()} ${request.url()} ${failure ? failure.errorText : ""}`);
  });

  page.on("response", response => {
    const status = response.status();
    if (status >= 400) {
      console.error(`[response:${status}] ${response.url()}`);
    }
  });

  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) {
      console.log(`[nav] ${frame.url()}`);
    }
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (!rows.length) return [];

  const header = rows[0].map(normalizeText);
  return rows
    .slice(1)
    .filter(cols => cols.some(v => normalizeText(v)))
    .map(cols => {
      const item = {};
      header.forEach((key, index) => {
        item[key] = cols[index] ?? "";
      });
      return item;
    });
}

function loadRows() {
  if (!fs.existsSync(CONFIG.csvPath)) {
    throw new Error(`CSV not found: ${CONFIG.csvPath}`);
  }

  const rows = parseCsv(fs.readFileSync(CONFIG.csvPath, "utf8").replace(/^\ufeff/, ""));
  if (!rows.length) {
    throw new Error("video.csv has no usable rows");
  }

  const required = [
    "category",
    "title",
    "subtitle",
    "standard_viewing_time",
    "upload_enabled",
    "image_path",
    "video_path",
    "introduction"
  ];

  const first = rows[0];
  const missing = required.filter(key => !(key in first));
  if (missing.length) {
    throw new Error(`CSV missing columns: ${missing.join(", ")}`);
  }

  return rows;
}

function resolveAssetPath(rootDir, rawPath) {
  const directPath = String(rawPath || "").trim();
  if (!directPath) {
    throw new Error("Asset path is empty");
  }

  const normalized = directPath.replace(/[\\/]+/g, path.sep);
  const candidates = [
    path.isAbsolute(directPath) ? directPath : null,
    path.join(rootDir, normalized),
    path.join(rootDir, path.basename(normalized))
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(`Asset file not found: ${rawPath}`);
}

async function getFirstVisible(locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function fillFirstVisible(page, selectors, value) {
  for (const selector of selectors) {
    const target = await getFirstVisible(page.locator(selector));
    if (target) {
      await target.click();
      await target.fill("");
      await target.fill(value);
      return true;
    }
  }
  return false;
}

async function clickFirstVisibleButton(page, labels) {
  for (const label of labels) {
    const button = await getFirstVisible(page.getByRole("button", { name: label, exact: false }));
    if (button) {
      await button.click();
      return true;
    }
  }
  return false;
}

async function isLoginPage(page) {
  const passwordInput = await getFirstVisible(page.locator('input[type="password"]'));
  if (passwordInput) return true;

  const bodyText = normalizeText(await page.locator("body").innerText()).toLowerCase();
  return bodyText.includes("login") || bodyText.includes("ログイン");
}

async function hasLoginForm(page) {
  const userInput = await getFirstVisible(page.locator([
    'input[name="loginId"]',
    'input[name="username"]',
    'input[name="userName"]',
    'input[name="email"]',
    'input[id*="login"]',
    'input[id*="user"]',
    'input[placeholder*="アカウント"]',
    'input[placeholder*="ユーザー"]',
    'input[placeholder*="メール"]',
    'input[placeholder*="user"]',
    'input[placeholder*="account"]',
    'input[type="text"]'
  ].join(",")));
  const passwordInput = await getFirstVisible(page.locator([
    'input[name="password"]',
    'input[id*="pass"]',
    'input[placeholder*="パスワード"]',
    'input[placeholder*="password"]',
    'input[type="password"]'
  ].join(",")));
  return Boolean(userInput && passwordInput);
}

async function tryAutoLogin(page) {
  if (!await hasLoginForm(page) && !await isLoginPage(page)) return false;

  console.log("Detected login page, trying automatic login");

  const userFilled = await fillFirstVisible(page, [
    'input[name="loginId"]',
    'input[name="username"]',
    'input[name="userName"]',
    'input[name="email"]',
    'input[id*="login"]',
    'input[id*="user"]',
    'input[placeholder*="アカウント"]',
    'input[placeholder*="ユーザー"]',
    'input[placeholder*="メール"]',
    'input[placeholder*="user"]',
    'input[placeholder*="account"]',
    'input[type="text"]'
  ], CONFIG.loginUser);

  const passwordFilled = await fillFirstVisible(page, [
    'input[name="password"]',
    'input[id*="pass"]',
    'input[placeholder*="パスワード"]',
    'input[placeholder*="password"]',
    'input[type="password"]'
  ], CONFIG.loginPassword);

  if (!userFilled || !passwordFilled) {
    console.log("Could not identify login fields reliably");
    return false;
  }

  const clicked = await clickFirstVisibleButton(page, ["ログイン", "Login", "サインイン", "Sign in", "signin"]);
  if (!clicked) {
    const passwordInput = await getFirstVisible(page.locator('input[type="password"]'));
    if (passwordInput) await passwordInput.press("Enter");
  }

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(2500);
  return true;
}

async function ensureLoggedIn(page) {
  let attempted = false;
  const deadline = Date.now() + CONFIG.loginDetectionWindowMs;

  while (Date.now() < deadline) {
    const loginPage = await isLoginPage(page);
    const loginForm = await hasLoginForm(page);

    if (!loginPage && !loginForm) {
      if (attempted) {
        await sleep(2000);
        if (!await isLoginPage(page) && !await hasLoginForm(page)) {
          return attempted;
        }
      } else {
        await sleep(1000);
        continue;
      }
    }

    for (let i = 0; i < CONFIG.maxAutoLoginAttempts; i++) {
      const ok = await tryAutoLogin(page);
      attempted = attempted || ok;
      await sleep(1500);

      if (!await isLoginPage(page) && !await hasLoginForm(page)) {
        return attempted;
      }
    }

    await sleep(1000);
  }

  return attempted;
}

async function maybeWaitForManualLogin(page) {
  if (!CONFIG.manualLoginFallback) return;
  if (await isLoginPage(page)) {
    console.log("Still on login page. Complete login manually, then press Enter here.");
    await new Promise(resolve => {
      process.stdin.resume();
      process.stdin.once("data", () => {
        process.stdin.pause();
        resolve();
      });
    });
  }
}

async function ensureUploadPage(page) {
  if (!page.url().startsWith(CONFIG.manageUrl)) {
    await page.goto(CONFIG.manageUrl, { waitUntil: "domcontentloaded" });
    await sleep(1500);
  }

  if (page.url().startsWith(CONFIG.startUrl)) {
    return;
  }

  const manageReadyDeadline = Date.now() + 30000;
  while (Date.now() < manageReadyDeadline) {
    const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
    const buttonCount = await page.locator("button").count().catch(() => 0);
    if (buttonCount > 0 || bodyText.includes("コース")) {
      break;
    }
    await sleep(1000);
  }

  for (const text of CONFIG.addCourseTexts) {
    const button = await getFirstVisible(page.getByRole("button", { name: text, exact: false }));
    if (button) {
      await button.click();
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await sleep(2000);
      return;
    }
  }

  const fallbackButton = await getFirstVisible(page.locator([
    'button:has-text("コース追加")',
    'button.MuiButton-root:has-text("コース追加")',
    'xpath=//button[contains(normalize-space(.), "コース追加")]'
  ].join(",")));

  if (fallbackButton) {
    await fallbackButton.click({ force: true });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await sleep(2000);
    return;
  }

  await dumpPageDiagnostics(page, "add-course-button-not-found");
  throw new Error(`Add course button not found: ${CONFIG.addCourseTexts.join("/")}`);
}

async function waitForUploadForm(page) {
  const deadline = Date.now() + 60000;
  let iteration = 0;

  while (Date.now() < deadline) {
    iteration += 1;
    const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
    const titleInput = await getFirstVisible(page.locator([
      'input[name="title"]',
      'input[placeholder*="タイトル"]',
      'input[placeholder*="title"]',
      'input[type="text"]'
    ].join(",")));
    const categoryControl = await getFirstVisible(page.locator('select, [role="combobox"], input[role="combobox"]'));
    const fileInputs = page.locator('input[type="file"]');
    const fileCount = await fileInputs.count().catch(() => 0);

    const hasKeyLabels =
      bodyText.includes("基本情報") &&
      bodyText.includes("アップロード") &&
      bodyText.includes("内容");

    if (iteration % 5 === 0) {
      console.log(
        `[waitForUploadForm] url=${page.url()} category=${Boolean(categoryControl)} title=${Boolean(titleInput)} files=${fileCount} labels=${hasKeyLabels}`
      );
    }

    if ((categoryControl && titleInput) || (hasKeyLabels && fileCount >= 2)) {
      await sleep(1500);
      return;
    }

    await sleep(1000);
  }

  await dumpPageDiagnostics(page, "upload-form-timeout");
  throw new Error("Upload form did not become ready in time");
}

async function getLabeledControl(page, labelTexts, controlSelector) {
  for (const labelText of labelTexts) {
    const label = page.locator(`label:has-text("${labelText}")`).first();
    if (await label.count()) {
      const direct = label.locator(`xpath=ancestor::*[self::div or self::label][1]`).locator(controlSelector).first();
      if (await direct.count()) return direct;

      const next = page.locator(
        `xpath=//label[contains(normalize-space(.), "${labelText}")]/following::*[self::input or self::textarea or self::select or @role="combobox"][1]`
      ).first();
      if (await next.count()) return next;
    }
  }
  return null;
}

async function getCategoryControl(page) {
  const labeledButton = page.locator(
    'xpath=//label[contains(normalize-space(.), "カテゴリ") or contains(normalize-space(.), "カテゴリー")]/following::*[@role="button" or @role="combobox"][1]'
  ).first();
  if (await labeledButton.count()) return labeledButton;

  const direct = await getLabeledControl(page, ["カテゴリ", "カテゴリー"], 'select, [role="button"], [role="combobox"], input[role="combobox"]');
  if (direct) return direct;

  const fallbackButton = page.locator('[role="button"][aria-haspopup="listbox"], [role="combobox"]').first();
  if (await fallbackButton.count()) return fallbackButton;

  const fallbackSelect = page.locator("select").first();
  if (await fallbackSelect.count()) return fallbackSelect;

  throw new Error("Category dropdown not found");
}

async function getTextInput(page, labels) {
  const direct = await getLabeledControl(page, labels, "input, textarea");
  if (direct) return direct;

  for (const label of labels) {
    const byLabel = page.getByLabel(label, { exact: false }).first();
    if (await byLabel.count()) return byLabel;
  }

  throw new Error(`Input not found: ${labels.join("/")}`);
}

async function selectCategory(page, categoryText) {
  const category = normalizeText(categoryText);
  const control = await getCategoryControl(page);
  const tagName = await control.evaluate(el => el.tagName.toLowerCase());
  const role = await control.getAttribute("role");

  if (tagName === "select") {
    const options = await control.locator("option").evaluateAll(nodes =>
      nodes.map(node => ({
        value: node.value,
        text: (node.textContent || "").replace(/\s+/g, " ").trim()
      }))
    );

    const exact = options.find(opt => opt.text === category);
    const fuzzy = options.find(opt => opt.text.includes(category) || category.includes(opt.text));
    const target = exact || fuzzy;
    if (!target) {
      throw new Error(`Category option not found: ${category}`);
    }
    await control.selectOption(target.value);
    return;
  }

  await control.scrollIntoViewIfNeeded().catch(() => {});
  await control.click({ force: true });
  const options = page.locator('[role="option"], li.MuiMenuItem-root');
  await options.first().waitFor({ state: "visible", timeout: CONFIG.defaultTimeoutMs });

  const exact = options.filter({ hasText: new RegExp(`^\\s*${escapeRegExp(category)}\\s*$`) }).first();
  if (await exact.count()) {
    await exact.click();
    return;
  }

  const fuzzy = options.filter({ hasText: category }).first();
  if (await fuzzy.count()) {
    await fuzzy.click();
    return;
  }

  throw new Error(`Category popup option not found: ${category}`);
}

async function fillInput(page, labels, value) {
  const input = await getTextInput(page, labels);
  await input.click();
  await input.fill("");
  await input.fill(String(value ?? ""));
}

async function setUploadToggle(page, rawValue) {
  const targetText = normalizeText(rawValue) === "しない" ? "しない" : "する";

  const label = page.locator(`label:has-text("${targetText}")`).first();
  if (await label.count()) {
    await label.click();
    return;
  }

  const textNode = page.getByText(targetText, { exact: true }).first();
  if (await textNode.count()) {
    await textNode.click();
    return;
  }

  throw new Error(`Upload toggle option not found: ${targetText}`);
}

async function getFileInputs(page) {
  const inputs = page.locator('input[type="file"]');
  const count = await inputs.count();
  if (count < 2) {
    throw new Error(`Expected 2 file inputs, found ${count}`);
  }
  return inputs;
}

async function setFiles(page, imagePath, videoPath) {
  const inputs = await getFileInputs(page);
  await inputs.nth(CONFIG.fileInputOrder.image).setInputFiles(imagePath);
  console.log(`Image selected: ${path.basename(imagePath)}`);
  await inputs.nth(CONFIG.fileInputOrder.video).setInputFiles(videoPath);
  console.log(`Video selected: ${path.basename(videoPath)}`);
}

async function waitForUploadReady(page) {
  const start = Date.now();
  let stableCount = 0;

  while (Date.now() - start < CONFIG.uploadTimeoutMs) {
    const text = normalizeText(await page.locator("body").innerText()).toLowerCase();
    const busy = CONFIG.busyTexts.some(word => text.includes(word.toLowerCase()));

    if (!busy) {
      stableCount += 1;
      if (stableCount >= 3) return;
    } else {
      stableCount = 0;
    }
    await sleep(1000);
  }

  throw new Error("Timed out waiting for upload/transcoding to finish");
}

async function setIntroduction(page, value) {
  const contentEditable = await getFirstVisible(page.locator('[contenteditable="true"]'));
  if (contentEditable) {
    await contentEditable.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.type(String(value ?? ""));
    return;
  }

  const textarea = await getTextInput(page, ["紹介", "介绍"]);
  await textarea.click();
  await textarea.fill("");
  await textarea.fill(String(value ?? ""));
}

async function clickSubmit(page) {
  for (const text of CONFIG.submitTexts) {
    const button = await getFirstVisible(page.getByRole("button", { name: text, exact: false }));
    if (button) {
      await button.click();
      return;
    }
  }

  for (const text of CONFIG.submitTexts) {
    const button = await getFirstVisible(page.locator([
      `button:has-text("${text}")`,
      `input[type="submit"][value*="${text}"]`,
      `input[type="button"][value*="${text}"]`,
      `xpath=//button[contains(normalize-space(.), "${text}")]`,
      `xpath=//input[(@type="submit" or @type="button") and contains(@value, "${text}")]`
    ].join(",")));
    if (button) {
      await button.scrollIntoViewIfNeeded().catch(() => {});
      await button.click({ force: true });
      return;
    }
  }

  const bottomPrimary = await getFirstVisible(page.locator(
    'button.MuiButton-contained, button.MuiButton-root[type="submit"], input[type="submit"]'
  ));
  if (bottomPrimary) {
    await bottomPrimary.scrollIntoViewIfNeeded().catch(() => {});
    await bottomPrimary.click({ force: true });
    return;
  }

  await dumpPageDiagnostics(page, "submit-button-not-found");
  throw new Error(`Submit button not found: ${CONFIG.submitTexts.join("/")}`);
}

async function waitForSuccess(page) {
  const start = Date.now();
  while (Date.now() - start < CONFIG.successTimeoutMs) {
    const text = normalizeText(await page.locator("body").innerText()).toLowerCase();
    const success = CONFIG.successTexts.some(word => text.includes(word.toLowerCase()));
    const error = ["error", "エラー", "失敗", "失败"].some(word => text.includes(word.toLowerCase()));
    if (success && !error) return;
    await sleep(1000);
  }
  throw new Error(`Success message timeout: ${CONFIG.successTexts.join("/")}`);
}

async function fillOne(page, row, index, total) {
  console.log(`Processing ${index + 1}/${total}: ${row.title}`);

  const imagePath = resolveAssetPath(CONFIG.imageRoot, row.image_path);
  const videoPath = resolveAssetPath(CONFIG.videoRoot, row.video_path);

  await selectCategory(page, row.category);
  await fillInput(page, ["タイトル", "title"], row.title || "");
  await fillInput(page, ["サブタイトル", "subtitle"], row.subtitle || "");
  await fillInput(page, ["標準視聴時間", "standard"], row.standard_viewing_time || "0");
  await setUploadToggle(page, row.upload_enabled || "する");
  await setFiles(page, imagePath, videoPath);
  await waitForUploadReady(page);
  await setIntroduction(page, row.introduction || "");
  await clickSubmit(page);
  await waitForSuccess(page);
  console.log(`Submitted ${index + 1}/${total}`);
  await sleep(CONFIG.afterSuccessWaitMs);
}

async function main() {
  const rows = loadRows();
  console.log(`Loaded ${rows.length} rows from CSV`);

  const browser = await chromium.launch({
    headless: CONFIG.headless,
    slowMo: CONFIG.slowMo
  });

  const page = await browser.newPage();
  attachPageDebugHooks(page);
  page.setDefaultTimeout(CONFIG.defaultTimeoutMs);
  await page.goto(CONFIG.manageUrl, { waitUntil: "domcontentloaded" });

  await ensureLoggedIn(page);
  await maybeWaitForManualLogin(page);
  await ensureUploadPage(page);
  await waitForUploadForm(page);

  for (let i = 0; i < rows.length; i++) {
    await fillOne(page, rows[i], i, rows.length);
  }

  console.log("All uploads completed");
}

main().catch(error => {
  console.error("Batch upload failed:", error);
  process.exit(1);
});
