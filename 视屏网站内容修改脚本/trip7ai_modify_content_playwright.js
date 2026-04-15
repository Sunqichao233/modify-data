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
  successTimeoutMs: 90000,
  afterSuccessWaitMs: 2500
};

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

function loadDataset() {
  if (!fs.existsSync(CONFIG.datasetPath)) {
    throw new Error(`Dataset not found: ${CONFIG.datasetPath}`);
  }
  const rows = parseCsv(fs.readFileSync(CONFIG.datasetPath, "utf8").replace(/^\ufeff/, ""));
  if (!rows.length) {
    throw new Error("modify_dataset.csv has no usable rows");
  }
  const required = ["filter_field", "filter_value", "modify_type", "modify_content"];
  const missing = required.filter(key => !(key in rows[0]));
  if (missing.length) {
    throw new Error(`Dataset missing columns: ${missing.join(", ")}`);
  }
  return rows;
}

function resolveAssetPath(rootDir, rawPath) {
  const directPath = String(rawPath || "").trim();
  if (!directPath) throw new Error("Asset path is empty");

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
    const input = await getFirstVisible(page.locator(selector));
    if (input) {
      await input.click();
      await input.fill("");
      await input.fill(value);
      return true;
    }
  }
  return false;
}

async function clickFirstVisibleButton(page, names) {
  for (const name of names) {
    const button = await getFirstVisible(page.getByRole("button", { name, exact: false }));
    if (button) {
      await button.click();
      return true;
    }
  }
  return false;
}

async function hasLoginForm(page) {
  const user = await getFirstVisible(page.locator([
    'input[name="loginId"]',
    'input[name="username"]',
    'input[name="userName"]',
    'input[name="email"]',
    'input[id*="login"]',
    'input[id*="user"]',
    'input[type="email"]',
    'input[type="tel"]',
    'input[placeholder*="user"]',
    'input[placeholder*="account"]',
    'input[placeholder*="mail"]',
    'input:not([type])',
    'input[type="text"]'
  ].join(",")));
  const pass = await getFirstVisible(page.locator([
    'input[name="password"]',
    'input[id*="pass"]',
    'input[placeholder*="password"]',
    'input[type="password"]'
  ].join(",")));
  return Boolean(user && pass);
}

async function isLoginPage(page) {
  const url = page.url().toLowerCase();
  if (url.includes("/login")) return true;
  const pass = await getFirstVisible(page.locator('input[type="password"]'));
  if (pass) return true;
  const body = normalizeText(await page.locator("body").innerText().catch(() => "")).toLowerCase();
  return body.includes("login") || body.includes("ログイン");
}

async function submitLogin(page) {
  const clicked = await clickFirstVisibleButton(page, ["ログイン", "Login", "サインイン", "Sign in", "signin"]);
  if (clicked) return true;
  const pass = await getFirstVisible(page.locator('input[type="password"]'));
  if (pass) {
    await pass.press("Enter").catch(() => {});
    return true;
  }
  return false;
}

async function loginIfNeeded(page) {
  const deadline = Date.now() + 90000;
  let attempts = 0;

  while (Date.now() < deadline) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const onLogin = await isLoginPage(page);
    if (!onLogin) {
      await page.goto(CONFIG.manageUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
      await sleep(1200);
      if (!await isLoginPage(page)) return;
    }

    if (!await hasLoginForm(page)) {
      await sleep(1200);
      continue;
    }

    attempts += 1;
    console.log(`Detected login page, trying automatic login (${attempts})`);
    await fillFirstVisible(page, [
      'input[name="loginId"]',
      'input[name="username"]',
      'input[name="userName"]',
      'input[name="email"]',
      'input[id*="login"]',
      'input[id*="user"]',
      'input[type="email"]',
      'input[type="tel"]',
      'input[placeholder*="user"]',
      'input[placeholder*="account"]',
      'input[placeholder*="mail"]',
      'input:not([type])',
      'input[type="text"]'
    ], CONFIG.loginUser);
    await fillFirstVisible(page, [
      'input[name="password"]',
      'input[id*="pass"]',
      'input[placeholder*="password"]',
      'input[type="password"]'
    ], CONFIG.loginPassword);
    await submitLogin(page);
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await sleep(2500);
  }

  await dumpPageDiagnostics(page, "login-timeout");
  throw new Error("Login did not complete in time");
}

async function waitForManageReady(page) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const filterButton = await getFirstVisible(
      page.locator('button[aria-label*="フィルター"], button:has-text("フィルター表示")')
    );
    if (filterButton) return;
    await sleep(1000);
  }
  await dumpPageDiagnostics(page, "manage-not-ready");
  throw new Error("Manage page not ready");
}

async function testManageHasContent(page) {
  // Test step before filtering: verify list content exists on manage page.
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const dataGridRows = page.locator(".MuiDataGrid-row");
    const tableRows = page.locator("tbody tr");
    const gridCount = await dataGridRows.count().catch(() => 0);
    const tableCount = await tableRows.count().catch(() => 0);
    const total = Math.max(gridCount, tableCount);

    if (total > 0) {
      const firstTitleCell = await getFirstVisible(
        page.locator('div[data-field="titleJp"] p, .MuiDataGrid-cell[data-field="titleJp"], tbody tr td:nth-child(2)')
      );
      const firstText = firstTitleCell
        ? normalizeText(await firstTitleCell.innerText().catch(() => ""))
        : "";
      console.log(`[manage-test] rows=${total} firstTitle="${firstText}"`);
      return;
    }
    await sleep(1000);
  }

  await dumpPageDiagnostics(page, "manage-content-empty");
  throw new Error("Manage page has no visible content rows");
}

async function openFilterAndApply(page, filterField, filterValue) {
  const filterButton = await getFirstVisible(
    page.locator('button[aria-label*="フィルター"], button:has-text("フィルター表示")')
  );
  if (!filterButton) throw new Error("Filter button not found");
  await filterButton.click();
  await sleep(500);

  const enabledVisibleSelects = [];
  const allSelects = page.locator("select");
  const selectCount = await allSelects.count();
  for (let i = 0; i < selectCount; i++) {
    const s = allSelects.nth(i);
    const isVisible = await s.isVisible().catch(() => false);
    const isDisabled = await s.isDisabled().catch(() => true);
    if (isVisible && !isDisabled) enabledVisibleSelects.push(s);
  }

  if (enabledVisibleSelects.length < 2) {
    await dumpPageDiagnostics(page, "filter-selects-not-found");
    throw new Error("Filter selects not found or disabled");
  }

  // Pick the column selector by known option values (id/titleJp/title/category/...),
  // and skip the disabled/logic operator selector.
  let colSelect = null;
  let opSelect = null;
  for (const s of enabledVisibleSelects) {
    const values = await s.locator("option").evaluateAll(nodes => nodes.map(n => String(n.value || "").trim()));
    if (values.includes("titleJp") || values.includes("title") || values.includes("category")) {
      colSelect = s;
      break;
    }
  }
  for (const s of enabledVisibleSelects) {
    if (s === colSelect) continue;
    const values = await s.locator("option").evaluateAll(nodes => nodes.map(n => String(n.value || "").trim().toLowerCase()));
    if (values.includes("contains") || values.includes("include") || values.includes("equal")) {
      opSelect = s;
      break;
    }
  }
  if (!colSelect) colSelect = enabledVisibleSelects[0];
  if (!opSelect) opSelect = enabledVisibleSelects.find(s => s !== colSelect) || enabledVisibleSelects[1];

  // Map dataset field to site value: title -> titleJp (タイトル)
  const rawField = normalizeText(filterField).toLowerCase();
  let targetFieldValue = rawField;
  if (rawField === "title" || rawField === "タイトル") targetFieldValue = "titleJp";
  if (rawField === "subtitle" || rawField === "サブタイトル") targetFieldValue = "title";

  const colValues = await colSelect.locator("option").evaluateAll(nodes => nodes.map(n => String(n.value || "").trim()));
  if (colValues.includes(targetFieldValue)) {
    await colSelect.selectOption(targetFieldValue);
  } else {
    const fallback = colValues.find(v => v.toLowerCase().includes(rawField)) || colValues[0];
    await colSelect.selectOption(fallback);
  }

  const opValues = await opSelect.locator("option").evaluateAll(nodes => nodes.map(n => String(n.value || "").trim().toLowerCase()));
  const opTarget =
    opValues.find(v => v === "contains" || v === "include") ||
    opValues.find(v => v.includes("contain")) ||
    opValues[0];
  await opSelect.selectOption(opTarget);

  const input = await getFirstVisible(
    page.locator('input[placeholder*="入力"], input[placeholder*="値"], input[type="text"]')
  );
  if (!input) throw new Error("Filter input not found");
  await input.click();
  await input.fill("");
  await input.fill(String(filterValue));
  await input.press("Enter").catch(() => {});
}

async function waitForUpdatePage(page, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    const fileCount = await page.locator('input[type="file"]').count().catch(() => 0);
    const submitCount = await page.locator('button[type="submit"], input[type="submit"]').count().catch(() => 0);
    if (url.startsWith(CONFIG.updateUrl) && (fileCount > 0 || submitCount > 0)) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

async function getFilteredRowId(page, filterValue) {
  await sleep(CONFIG.waitAfterFilterMs);
  const normalizedTarget = normalizeText(filterValue);

  // Preferred: filtered MUI row that contains title text.
  const gridRow = await getFirstVisible(page.locator(".MuiDataGrid-row").filter({ hasText: normalizedTarget }));
  if (gridRow) {
    const dataId = (await gridRow.getAttribute("data-id").catch(() => "")) || "";
    const dataIdMatch = dataId.match(/\d+/);
    if (dataIdMatch) return dataIdMatch[0];

    const idCellInRow = await getFirstVisible(gridRow.locator('div[data-field="id"] .MuiDataGrid-cellContent, div[data-field="id"]'));
    if (idCellInRow) {
      const text = normalizeText(await idCellInRow.innerText().catch(() => ""));
      const match = text.match(/\d+/);
      if (match) return match[0];
    }
  }

  // Fallback: first visible ID cell in current filtered list.
  const idCell = await getFirstVisible(
    page.locator('div[data-field="id"] .MuiDataGrid-cellContent, .MuiDataGrid-cell[data-field="id"], tbody tr td:nth-child(1)')
  );
  if (idCell) {
    const text = normalizeText(await idCell.innerText().catch(() => ""));
    const match = text.match(/\d+/);
    if (match) return match[0];
  }

  await dumpPageDiagnostics(page, "filtered-id-not-found");
  throw new Error(`Filtered row ID not found for: ${filterValue}`);
}

async function getFileInputs(page, modifyType) {
  const inputs = page.locator('input[type="file"]');
  const count = await inputs.count();
  const required = modifyType === "video" ? 2 : 1;
  if (count < required) {
    await dumpPageDiagnostics(page, "file-inputs-not-found");
    throw new Error(`Expected >=${required} file inputs for ${modifyType}, found ${count}. url=${page.url()}`);
  }
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
  throw new Error(`Unsupported modify_type: ${row.modify_type}. Use image or video`);
}

async function clickSubmit(page) {
  const submit = await getFirstVisible(page.locator(
    'button[type="submit"], input[type="submit"], button:has-text("提出"), button:has-text("保存"), button:has-text("登録")'
  ));
  if (!submit) {
    await dumpPageDiagnostics(page, "submit-not-found");
    throw new Error("Submit button not found");
  }
  await submit.click({ force: true });
}

async function waitForSuccess(page) {
  const deadline = Date.now() + CONFIG.successTimeoutMs;
  while (Date.now() < deadline) {
    const text = normalizeText(await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (text.includes("成功") || text.includes("完了") || text.includes("保存しました") || text.includes("登録しました")) {
      return;
    }
    await sleep(1000);
  }
  await dumpPageDiagnostics(page, "success-timeout");
  throw new Error("Success message timeout");
}

async function main() {
  const rows = loadDataset();
  console.log(`Loaded ${rows.length} rows from dataset`);

  const browser = await chromium.launch({ headless: CONFIG.headless, slowMo: CONFIG.slowMo });
  const page = await browser.newPage();
  page.setDefaultTimeout(CONFIG.defaultTimeoutMs);
  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) console.log(`[nav] ${frame.url()}`);
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`Processing ${i + 1}/${rows.length}: ${row.filter_field}=${row.filter_value}, modify=${row.modify_type}`);

    await page.goto(CONFIG.manageUrl, { waitUntil: "domcontentloaded" });
    await loginIfNeeded(page);
    await page.goto(CONFIG.manageUrl, { waitUntil: "domcontentloaded" });
    await waitForManageReady(page);
    await sleep(CONFIG.waitAfterManageOpenMs);
    await testManageHasContent(page);
    await openFilterAndApply(page, row.filter_field, row.filter_value);
    const itemId = await getFilteredRowId(page, row.filter_value);
    console.log(`[filtered-id] ${itemId}`);

    await page.goto(`${CONFIG.updateUrl}/${itemId}`, { waitUntil: "domcontentloaded" });
    if (!await waitForUpdatePage(page, 20000)) {
      await dumpPageDiagnostics(page, "update-page-not-ready");
      throw new Error(`Did not reach update page: ${CONFIG.updateUrl}/${itemId}`);
    }

    await applyModification(page, row);
    await clickSubmit(page);
    await waitForSuccess(page);
    console.log(`Submitted: ${row.filter_value}`);
    await sleep(CONFIG.afterSuccessWaitMs);
  }

  console.log("All modifications completed");
  await browser.close();
}

main().catch(error => {
  console.error("Modify script failed:", error);
  process.exit(1);
});
