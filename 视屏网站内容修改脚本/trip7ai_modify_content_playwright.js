const fs = require("fs");
const path = require("path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Missing playwright. Run: npm install playwright");
  process.exit(1);
}

const CONFIG = {
  manageUrl: process.env.TRIP7_MANAGE_URL || "https://www.trip7.ai/school/manage",
  updateUrl: process.env.TRIP7_UPDATE_URL || "https://www.trip7.ai/school/update",
  datasetPath: path.join(__dirname, "modify_dataset.csv"),
  imageRoot: path.join(__dirname, "images"),
  videoRoot: path.join(__dirname, "videos"),
  debugDir: path.join(__dirname, "debug"),
  loginUser: process.env.TRIP7_LOGIN_USER || "trip777admin",
  loginPassword: process.env.TRIP7_LOGIN_PASSWORD || "Trip7Trip7",
  headless: false,
  slowMo: 120,
  defaultTimeoutMs: 15000,
  waitAfterManageOpenMs: 15000,
  waitAfterFilterMs: 10000,
  waitAfterImageSelectMs: 10000,
  waitAfterVideoSelectMs: 60000,
  postSubmitResultTimeoutMs: 90000,
  afterSuccessWaitMs: 2500
};

const BASE_COLUMNS = ["filter_field", "filter_value", "modify_type", "modify_content"];
const STATUS_COLUMN = "upload_status";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
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
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => "");
  fs.writeFileSync(htmlPath, html, "utf8");
  console.error(`Diagnostics saved: ${screenshotPath}`);
  console.error(`Diagnostics saved: ${htmlPath}`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  const v = String(value ?? "");
  if (v.includes('"') || v.includes(",") || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function loadDataset() {
  if (!fs.existsSync(CONFIG.datasetPath)) {
    throw new Error(`Dataset not found: ${CONFIG.datasetPath}`);
  }
  const text = fs.readFileSync(CONFIG.datasetPath, "utf8").replace(/^\ufeff/, "");
  const matrix = parseCsv(text);
  if (!matrix.length) throw new Error("modify_dataset.csv is empty");

  const header = matrix[0].map(normalizeText);
  const missing = BASE_COLUMNS.filter(k => !header.includes(k));
  if (missing.length) throw new Error(`Dataset missing columns: ${missing.join(", ")}`);

  if (!header.includes(STATUS_COLUMN)) header.push(STATUS_COLUMN);

  const rows = matrix
    .slice(1)
    .filter(cols => cols.some(v => normalizeText(v)))
    .map(cols => {
      const item = {};
      header.forEach((key, idx) => {
        item[key] = cols[idx] ?? "";
      });
      return item;
    });

  return { header, rows };
}

function saveDataset(header, rows) {
  const lines = [];
  lines.push(header.map(csvEscape).join(","));
  for (const row of rows) {
    const line = header.map(col => csvEscape(row[col] ?? "")).join(",");
    lines.push(line);
  }
  fs.writeFileSync(CONFIG.datasetPath, `${lines.join("\n")}\n`, "utf8");
}

function resolveAssetPath(rootDir, rawPath) {
  const direct = String(rawPath || "").trim();
  if (!direct) throw new Error("Asset path is empty");
  const normalized = direct.replace(/[\\/]+/g, path.sep);
  const candidates = [
    path.isAbsolute(direct) ? direct : null,
    path.join(rootDir, normalized),
    path.join(rootDir, path.basename(normalized))
  ].filter(Boolean);
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  throw new Error(`Asset file not found: ${rawPath}`);
}

async function getFirstVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function fillFirstVisible(page, selectors, value) {
  for (const selector of selectors) {
    const input = await getFirstVisible(page.locator(selector));
    if (!input) continue;
    await input.click().catch(() => {});
    await input.fill("").catch(() => {});
    await input.fill(value).catch(() => {});
    return true;
  }
  return false;
}

async function hasLoginForm(page) {
  const user = await getFirstVisible(page.locator('input[name="loginId"],input[name="username"],input[name="userName"],input[name="email"],input[type="email"],input[type="text"]'));
  const pass = await getFirstVisible(page.locator('input[name="password"],input[type="password"]'));
  return Boolean(user && pass);
}

async function isLoginPage(page) {
  const url = page.url().toLowerCase();
  if (url.includes("/login")) return true;
  return Boolean(await getFirstVisible(page.locator('input[type="password"]')));
}

async function loginIfNeeded(page) {
  const deadline = Date.now() + 90000;
  let tries = 0;

  while (Date.now() < deadline) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    if (!await isLoginPage(page)) return;
    if (!await hasLoginForm(page)) {
      await sleep(1000);
      continue;
    }

    tries += 1;
    console.log(`Detected login page, trying automatic login (${tries})`);
    await fillFirstVisible(page, [
      'input[name="loginId"]',
      'input[name="username"]',
      'input[name="userName"]',
      'input[name="email"]',
      'input[type="email"]',
      'input[type="text"]'
    ], CONFIG.loginUser);
    await fillFirstVisible(page, ['input[name="password"]', 'input[type="password"]'], CONFIG.loginPassword);

    const loginBtn = await getFirstVisible(page.getByRole("button", { name: /ログイン|login|sign in/i }));
    if (loginBtn) {
      await loginBtn.click().catch(() => {});
    } else {
      const pass = await getFirstVisible(page.locator('input[type="password"]'));
      if (pass) await pass.press("Enter").catch(() => {});
    }
    await sleep(2500);
  }

  throw new Error("Login did not complete in time");
}

async function waitForManageReady(page) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const filterBtn = await getFirstVisible(page.locator('button[aria-label*="フィルター"], button:has-text("フィルター"), button:has-text("フィルター表示")'));
    if (filterBtn) return;
    await sleep(1000);
  }
  throw new Error("Manage page not ready");
}

async function ensureAtManage(page) {
  if (!page.url().startsWith(CONFIG.manageUrl)) {
    await page.goto(CONFIG.manageUrl, { waitUntil: "domcontentloaded" });
  }
  await loginIfNeeded(page);
  if (!page.url().startsWith(CONFIG.manageUrl)) {
    await page.goto(CONFIG.manageUrl, { waitUntil: "domcontentloaded" });
  }
}

async function openFilterAndApply(page, filterField, filterValue) {
  const filterBtn = await getFirstVisible(page.locator('button[aria-label*="フィルター"], button:has-text("フィルター"), button:has-text("フィルター表示")'));
  if (!filterBtn) throw new Error("Filter button not found");
  await filterBtn.click();
  await sleep(500);

  const selects = page.locator("select");
  const count = await selects.count();
  const enabled = [];
  for (let i = 0; i < count; i++) {
    const s = selects.nth(i);
    const visible = await s.isVisible().catch(() => false);
    const disabled = await s.isDisabled().catch(() => true);
    if (visible && !disabled) enabled.push(s);
  }
  if (enabled.length < 2) throw new Error("Filter selects not found");

  let colSelect = null;
  let opSelect = null;
  for (const s of enabled) {
    const values = await s.locator("option").evaluateAll(nodes => nodes.map(n => String(n.value || "").trim()));
    if (values.includes("titleJp") || values.includes("title") || values.includes("category")) colSelect = s;
    if (values.map(v => v.toLowerCase()).includes("contains")) opSelect = s;
  }
  if (!colSelect) colSelect = enabled[0];
  if (!opSelect) opSelect = enabled.find(s => s !== colSelect) || enabled[1];

  const targetField = normalizeText(filterField).toLowerCase() === "title" ? "titleJp" : normalizeText(filterField).toLowerCase();
  const colValues = await colSelect.locator("option").evaluateAll(nodes => nodes.map(n => String(n.value || "").trim()));
  await colSelect.selectOption(colValues.includes(targetField) ? targetField : colValues[0]);

  const opValues = await opSelect.locator("option").evaluateAll(nodes => nodes.map(n => String(n.value || "").trim().toLowerCase()));
  await opSelect.selectOption(opValues.includes("contains") ? "contains" : opValues[0]);

  const input = await getFirstVisible(page.locator('input[placeholder*="値"], input[type="text"]'));
  if (!input) throw new Error("Filter input not found");
  await input.click();
  await input.fill("");
  await input.fill(String(filterValue));
  await input.press("Enter").catch(() => {});
}

async function getFilteredRowId(page, filterValue) {
  await sleep(CONFIG.waitAfterFilterMs);
  const target = normalizeText(filterValue);

  const row = await getFirstVisible(page.locator(".MuiDataGrid-row").filter({ hasText: target }));
  if (row) {
    const dataId = await row.getAttribute("data-id").catch(() => "");
    const m1 = String(dataId || "").match(/\d+/);
    if (m1) return m1[0];
    const idCell = await getFirstVisible(row.locator('div[data-field="id"] .MuiDataGrid-cellContent, div[data-field="id"]'));
    if (idCell) {
      const m2 = normalizeText(await idCell.innerText().catch(() => "")).match(/\d+/);
      if (m2) return m2[0];
    }
  }

  const fallbackCell = await getFirstVisible(page.locator('div[data-field="id"] .MuiDataGrid-cellContent, .MuiDataGrid-cell[data-field="id"], tbody tr td:nth-child(1)'));
  if (fallbackCell) {
    const m = normalizeText(await fallbackCell.innerText().catch(() => "")).match(/\d+/);
    if (m) return m[0];
  }

  throw new Error(`Filtered row ID not found for: ${filterValue}`);
}

async function waitForUpdateReady(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const onUpdate = page.url().startsWith(CONFIG.updateUrl);
    const fileCount = await page.locator('input[type="file"]').count().catch(() => 0);
    const submitCount = await page.locator('button[type="submit"], input[type="submit"]').count().catch(() => 0);
    if (onUpdate && (fileCount > 0 || submitCount > 0)) return true;
    await sleep(500);
  }
  return false;
}

async function getFileInputs(page, type) {
  const inputs = page.locator('input[type="file"]');
  const count = await inputs.count();
  const required = type === "video" ? 2 : 1;
  if (count < required) throw new Error(`Expected >=${required} file inputs for ${type}, found ${count}`);
  return inputs;
}

async function applyModification(page, row) {
  const type = normalizeText(row.modify_type).toLowerCase();
  const content = String(row.modify_content || "").trim();
  const inputs = await getFileInputs(page, type);

  if (type === "image") {
    const imagePath = resolveAssetPath(CONFIG.imageRoot, content);
    await inputs.nth(0).setInputFiles(imagePath);
    console.log(`Image selected: ${path.basename(imagePath)} (wait 10s)`);
    await sleep(CONFIG.waitAfterImageSelectMs);
    return;
  }

  if (type === "video") {
    const videoPath = resolveAssetPath(CONFIG.videoRoot, content);
    await inputs.nth(1).setInputFiles(videoPath);
    console.log(`Video selected: ${path.basename(videoPath)} (wait 60s)`);
    await sleep(CONFIG.waitAfterVideoSelectMs);
    return;
  }

  throw new Error(`Unsupported modify_type: ${row.modify_type}`);
}

async function clickSubmit(page) {
  const submit = await getFirstVisible(page.locator(
    'button[type="submit"], input[type="submit"], button:has-text("提出"), button:has-text("保存"), button:has-text("更新"), button:has-text("登録"), button:has-text("提交")'
  ));
  if (!submit) throw new Error("Submit button not found");
  await submit.click({ force: true });
}

function hasSuccessText(bodyText) {
  const text = normalizeText(bodyText).toLowerCase();
  const keywords = ["保存しました", "更新しました", "登録しました", "作成しました", "成功", "完了", "submitted", "saved", "updated"];
  return keywords.some(k => text.includes(k.toLowerCase()));
}

async function waitForSubmitResult(page) {
  const deadline = Date.now() + CONFIG.postSubmitResultTimeoutMs;
  while (Date.now() < deadline) {
    if (page.url().startsWith(CONFIG.manageUrl)) return;
    const body = await page.locator("body").innerText().catch(() => "");
    if (hasSuccessText(body)) return;
    await sleep(1000);
  }
  throw new Error("Submit result timeout");
}

function compactError(error) {
  const msg = normalizeText(error && error.message ? error.message : String(error || "unknown error"));
  return msg.length > 180 ? `${msg.slice(0, 180)}...` : msg;
}

async function processOne(page, row) {
  await ensureAtManage(page);
  await waitForManageReady(page);
  await sleep(CONFIG.waitAfterManageOpenMs);
  await openFilterAndApply(page, row.filter_field, row.filter_value);

  const itemId = await getFilteredRowId(page, row.filter_value);
  console.log(`[filtered-id] ${itemId}`);

  await page.goto(`${CONFIG.updateUrl}/${itemId}`, { waitUntil: "domcontentloaded" });
  if (!await waitForUpdateReady(page, 20000)) {
    throw new Error(`Did not reach update page: ${CONFIG.updateUrl}/${itemId}`);
  }

  await applyModification(page, row);
  await clickSubmit(page);
  await waitForSubmitResult(page);
}

async function main() {
  const dataset = loadDataset();
  const { header, rows } = dataset;
  console.log(`Loaded ${rows.length} rows from dataset`);

  const browser = await chromium.launch({ headless: CONFIG.headless, slowMo: CONFIG.slowMo });
  const page = await browser.newPage();
  page.setDefaultTimeout(CONFIG.defaultTimeoutMs);
  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) console.log(`[nav] ${frame.url()}`);
  });

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`Processing ${i + 1}/${rows.length}: ${row.filter_field}=${row.filter_value}, modify=${row.modify_type}`);
    try {
      await processOne(page, row);
      row[STATUS_COLUMN] = "success";
      successCount += 1;
      console.log(`Submitted: ${row.filter_value}`);
      await sleep(CONFIG.afterSuccessWaitMs);
    } catch (error) {
      row[STATUS_COLUMN] = `failed: ${compactError(error)}`;
      failCount += 1;
      console.error(`Row failed: ${row.filter_value} -> ${row[STATUS_COLUMN]}`);
      await dumpPageDiagnostics(page, "row-failed").catch(() => {});
    } finally {
      saveDataset(header, rows);
    }
  }

  console.log(`All done. success=${successCount}, failed=${failCount}`);
  await browser.close();
}

main().catch(error => {
  console.error("Modify script failed:", error);
  process.exit(1);
});
