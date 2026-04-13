// Trip7 批量上传视频脚本
// 使用方式：
// 1. 打开视频上传页面
// 2. 在控制台粘贴本脚本并执行
// 3. 页面右下角会出现“开始批量上传”按钮，点击后依次选择：
//    - video.csv
//    - 图片所在文件夹
//    - 视频所在文件夹
// 4. 脚本会按 CSV 每一行自动填写表单、上传图片/视频、提交并等待成功提示
//
// CSV 表头：
// category,title,subtitle,standard_viewing_time,upload_enabled,image_path,video_path,introduction
//
// 建议：
// - image_path / video_path 使用相对文件名，例如 covers/a.jpg、videos/a.mp4
// - 如果填写绝对路径，脚本会自动截取文件名部分去所选目录里查找

(function bootstrapBatchUpload() {
  if (window.__trip7UploadBootstrapped) {
    console.log("⚠️ 批量上传脚本已经注入");
    return;
  }
  window.__trip7UploadBootstrapped = true;

  const CONFIG = {
    submitWaitMs: 2000,
    uploadPollMs: 1000,
    uploadTimeoutMs: 10 * 60 * 1000,
    successTimeoutMs: 90 * 1000,
    afterSuccessWaitMs: 2500,
    optionMatchMode: "includes"
  };

  const state = {
    csvRows: [],
    imageRoot: null,
    videoRoot: null,
    busy: false
  };

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, "\"\"")}"`;
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
      } else if (char === "\r") {
        continue;
      } else {
        cell += char;
      }
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    if (!rows.length) return [];

    const header = rows[0].map(x => normalizeText(x));
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

  async function pickFile(accept = ".csv") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);

    const file = await new Promise((resolve, reject) => {
      input.addEventListener("change", () => {
        const picked = input.files && input.files[0];
        input.remove();
        if (picked) {
          resolve(picked);
        } else {
          reject(new Error("未选择文件"));
        }
      }, { once: true });
      input.click();
    });

    return file;
  }

  async function pickDirectory(label) {
    if (!window.showDirectoryPicker) {
      throw new Error(`当前浏览器不支持目录授权，无法选择${label}`);
    }
    return window.showDirectoryPicker({ mode: "read" });
  }

  async function readCsvFromPicker() {
    const csvFile = await pickFile(".csv,text/csv");
    const text = await csvFile.text();
    const rows = parseCsv(text.replace(/^\ufeff/, ""));
    if (!rows.length) {
      throw new Error("CSV 没有可用数据行");
    }
    return rows;
  }

  function getPathLeaf(path) {
    return String(path || "").split(/[\\/]/).filter(Boolean).pop() || "";
  }

  async function getFileHandleByRelativePath(rootHandle, relativePath) {
    const segments = String(relativePath || "")
      .split(/[\\/]/)
      .map(s => s.trim())
      .filter(Boolean);

    if (!segments.length) {
      throw new Error("文件路径为空");
    }

    let current = rootHandle;
    for (let i = 0; i < segments.length - 1; i++) {
      current = await current.getDirectoryHandle(segments[i]);
    }
    return current.getFileHandle(segments[segments.length - 1]);
  }

  async function resolveFile(rootHandle, rawPath) {
    const directPath = String(rawPath || "").trim();
    if (!directPath) {
      throw new Error("文件路径为空");
    }

    try {
      const handle = await getFileHandleByRelativePath(rootHandle, directPath);
      return handle.getFile();
    } catch (_) {
      const leaf = getPathLeaf(directPath);
      if (!leaf) throw _;
      const handle = await rootHandle.getFileHandle(leaf);
      return handle.getFile();
    }
  }

  function getAllCandidates(selectors) {
    return selectors.flatMap(selector => [...document.querySelectorAll(selector)]);
  }

  function getVisibleElements(selectors) {
    return getAllCandidates(selectors).filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none";
    });
  }

  function getLabelTextFor(control) {
    if (!control) return "";
    const id = control.id;
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) return normalizeText(label.textContent);
    }
    const wrapper = control.closest(".MuiFormControl-root, .MuiTextField-root, .MuiGrid-item, div");
    if (!wrapper) return "";
    const labels = [...wrapper.querySelectorAll("label, p, span, legend")];
    return normalizeText(labels.map(x => x.textContent).join(" "));
  }

  function findTextInputByHint(hints) {
    const targets = getVisibleElements([
      'input[type="text"]',
      'input:not([type])',
      'textarea',
      '[contenteditable="true"]'
    ]);

    for (const el of targets) {
      const parts = [
        el.placeholder,
        el.getAttribute("aria-label"),
        el.name,
        getLabelTextFor(el),
        el.closest(".MuiInputBase-root, .MuiFormControl-root, .ql-container, .ql-toolbar, .ck-editor")
          ?.parentElement?.textContent
      ]
        .filter(Boolean)
        .map(normalizeText)
        .join(" ");

      if (hints.some(hint => parts.includes(hint))) {
        return el;
      }
    }
    return null;
  }

  function findSelectByHints(hints) {
    const selects = getVisibleElements(["select", '[role="combobox"]', 'input[role="combobox"]']);
    for (const el of selects) {
      const parts = [
        el.name,
        el.getAttribute("aria-label"),
        el.textContent,
        getLabelTextFor(el),
        el.closest(".MuiFormControl-root, .MuiGrid-item, div")?.textContent
      ]
        .filter(Boolean)
        .map(normalizeText)
        .join(" ");

      if (hints.some(hint => parts.includes(hint))) {
        return el;
      }
    }
    return null;
  }

  function setNativeValue(element, value) {
    const tag = element.tagName.toLowerCase();
    if (tag === "input") {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(element, value);
    } else if (tag === "textarea") {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(element, value);
    } else {
      element.textContent = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function setTextField(element, value) {
    if (!element) throw new Error("未找到文本输入框");
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(200);
    element.focus();

    if (element.isContentEditable) {
      element.innerHTML = "";
      document.execCommand("insertText", false, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      setNativeValue(element, value);
    }

    element.blur();
  }

  async function setRichText(value) {
    const editor = findTextInputByHint(["写点什么", "紹介", "介绍", "説明"]);
    if (!editor) {
      throw new Error("未找到介绍编辑器");
    }
    await setTextField(editor, value);
  }

  async function setRadioUploadEnabled(rawValue) {
    const value = normalizeText(rawValue);
    if (!value) return;
    const wantYes = ["する", "yes", "true", "1", "on"].includes(value.toLowerCase()) || value === "する";
    const labelTexts = wantYes ? ["する"] : ["しない"];

    const labels = [...document.querySelectorAll("label, span, p")];
    const target = labels.find(el => labelTexts.includes(normalizeText(el.textContent)));
    if (!target) {
      console.warn("⚠️ 未找到上传开关，跳过");
      return;
    }

    const clickable = target.closest("label") || target;
    clickable.click();
    await sleep(200);
  }

  async function openSelectAndChoose(selectLike, targetText) {
    const target = normalizeText(targetText);
    if (!selectLike) throw new Error("未找到下拉框");

    if (selectLike.tagName.toLowerCase() === "select") {
      const options = [...selectLike.options];
      const match = options.find(opt => {
        const text = normalizeText(opt.textContent || opt.label || opt.value);
        return CONFIG.optionMatchMode === "includes"
          ? text.includes(target) || target.includes(text)
          : text === target;
      });

      if (!match) {
        throw new Error(`下拉框中未找到选项: ${targetText}`);
      }

      selectLike.value = match.value;
      selectLike.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    selectLike.click();
    await sleep(500);

    for (let i = 0; i < 30; i++) {
      const options = [
        ...document.querySelectorAll('[role="option"]'),
        ...document.querySelectorAll("li.MuiMenuItem-root")
      ];

      const match = options.find(opt => {
        const text = normalizeText(opt.textContent);
        return CONFIG.optionMatchMode === "includes"
          ? text.includes(target) || target.includes(text)
          : text === target;
      });

      if (match) {
        match.click();
        return;
      }
      await sleep(200);
    }

    throw new Error(`弹出选项中未找到: ${targetText}`);
  }

  async function attachFile(fileInput, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function scoreFileInput(input) {
    const scopeText = normalizeText(
      [
        input.accept,
        input.name,
        input.id,
        input.getAttribute("aria-label"),
        input.closest("div, label, section")?.textContent
      ].filter(Boolean).join(" ")
    ).toLowerCase();

    let score = 0;
    if (scopeText.includes("image") || scopeText.includes("写真") || scopeText.includes("画像")) score += 3;
    if (scopeText.includes("video") || scopeText.includes("動画")) score += 3;
    if (input.accept?.includes("image")) score += 2;
    if (input.accept?.includes("video")) score += 2;
    return score;
  }

  function findFileInput(kind) {
    const inputs = getVisibleElements(['input[type="file"]']);
    if (!inputs.length) {
      throw new Error("当前页面没有可见的文件上传控件");
    }

    const sorted = inputs
      .map(input => ({ input, score: scoreFileInput(input) }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.input);

    if (kind === "image") {
      return sorted.find(input => {
        const text = normalizeText(
          [input.accept, input.closest("div, label, section")?.textContent].filter(Boolean).join(" ")
        ).toLowerCase();
        return text.includes("image") || text.includes("画像") || text.includes("写真");
      }) || sorted[0];
    }

    if (kind === "video") {
      return sorted.find(input => {
        const text = normalizeText(
          [input.accept, input.closest("div, label, section")?.textContent].filter(Boolean).join(" ")
        ).toLowerCase();
        return text.includes("video") || text.includes("動画");
      }) || sorted[1] || sorted[0];
    }

    return sorted[0];
  }

  async function waitForUploadQuietly(timeoutMs) {
    const start = Date.now();
    let stableCount = 0;

    while (Date.now() - start < timeoutMs) {
      const pageText = normalizeText(document.body.innerText).toLowerCase();
      const busy = ["uploading", "アップロード中", "処理中", "transcoding", "変換中"].some(x =>
        pageText.includes(x.toLowerCase())
      );

      if (!busy) {
        stableCount += 1;
        if (stableCount >= 3) return;
      } else {
        stableCount = 0;
      }

      await sleep(CONFIG.uploadPollMs);
    }
    console.warn("⚠️ 上传等待超时，继续下一步");
  }

  function findSubmitButton() {
    const candidates = [...document.querySelectorAll("button")];
    return candidates.find(btn => {
      const text = normalizeText(btn.textContent);
      return ["提交", "保存", "登録", "作成", "追加", "送信"].some(word => text.includes(word));
    }) || null;
  }

  async function waitForSuccess() {
    const start = Date.now();
    while (Date.now() - start < CONFIG.successTimeoutMs) {
      const pageText = normalizeText(document.body.innerText).toLowerCase();
      const success = ["成功", "完了", "保存しました", "登録しました", "作成しました", "uploaded"].some(word =>
        pageText.includes(word.toLowerCase())
      );
      const error = ["失敗", "エラー", "error"].some(word => pageText.includes(word.toLowerCase()));

      if (success && !error) return;
      await sleep(1000);
    }
    throw new Error("等待成功提示超时");
  }

  async function fillRow(row, index) {
    console.log(`\n🚀 开始第 ${index + 1} 条: ${row.title || "(无标题)"}`);

    const categoryInput = findSelectByHints(["カテゴリ", "カテゴリー", "category"]);
    const titleInput = findTextInputByHint(["タイトル", "title"]);
    const subtitleInput = findTextInputByHint(["サブタイトル", "subtitle"]);
    const timeInput = findTextInputByHint(["標準視聴時間", "视聴時間", "standard"]);

    if (!categoryInput) throw new Error("未找到分类下拉框");
    if (!titleInput) throw new Error("未找到标题输入框");
    if (!subtitleInput) throw new Error("未找到副标题输入框");
    if (!timeInput) throw new Error("未找到标准视听时间输入框");

    await openSelectAndChoose(categoryInput, row.category);
    await sleep(300);
    await setTextField(titleInput, row.title || "");
    await sleep(200);
    await setTextField(subtitleInput, row.subtitle || "");
    await sleep(200);
    await setTextField(timeInput, row.standard_viewing_time || "0");
    await sleep(200);
    await setRadioUploadEnabled(row.upload_enabled || "する");

    const imageFile = await resolveFile(state.imageRoot, row.image_path);
    const videoFile = await resolveFile(state.videoRoot, row.video_path);

    const imageInput = findFileInput("image");
    const videoInput = findFileInput("video");

    console.log(`🖼️ 上传图片: ${imageFile.name}`);
    await attachFile(imageInput, imageFile);
    await sleep(1000);

    console.log(`🎬 上传视频: ${videoFile.name}`);
    await attachFile(videoInput, videoFile);
    await waitForUploadQuietly(CONFIG.uploadTimeoutMs);

    await setRichText(row.introduction || "");
    await sleep(300);

    const submitBtn = findSubmitButton();
    if (!submitBtn) {
      throw new Error("未找到提交按钮");
    }

    submitBtn.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(300);
    submitBtn.click();
    console.log("✅ 已点击提交");

    await sleep(CONFIG.submitWaitMs);
    await waitForSuccess();
    console.log("✅ 检测到成功提示");
    await sleep(CONFIG.afterSuccessWaitMs);
  }

  function validateRows(rows) {
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

    const first = rows[0] || {};
    const missing = required.filter(key => !(key in first));
    if (missing.length) {
      throw new Error(`CSV 缺少列: ${missing.join(", ")}`);
    }
  }

  async function startBatchUpload() {
    if (state.busy) {
      console.warn("⚠️ 正在执行中");
      return;
    }

    state.busy = true;
    try {
      state.csvRows = await readCsvFromPicker();
      validateRows(state.csvRows);
      console.log(`📄 已读取 CSV，共 ${state.csvRows.length} 条`);

      state.imageRoot = await pickDirectory("图片目录");
      console.log("📁 已授权图片目录");
      state.videoRoot = await pickDirectory("视频目录");
      console.log("📁 已授权视频目录");

      for (let i = 0; i < state.csvRows.length; i++) {
        try {
          await fillRow(state.csvRows[i], i);
        } catch (error) {
          console.error(`❌ 第 ${i + 1} 条处理失败`, state.csvRows[i], error);
          throw error;
        }
      }

      console.log("🏁 全部视频上传完成");
    } finally {
      state.busy = false;
    }
  }

  function renderStartButton() {
    const button = document.createElement("button");
    button.textContent = "开始批量上传";
    button.style.position = "fixed";
    button.style.right = "24px";
    button.style.bottom = "24px";
    button.style.zIndex = "99999";
    button.style.padding = "12px 18px";
    button.style.border = "none";
    button.style.borderRadius = "8px";
    button.style.background = "#1746a2";
    button.style.color = "#fff";
    button.style.fontSize = "14px";
    button.style.cursor = "pointer";
    button.style.boxShadow = "0 6px 18px rgba(0,0,0,.2)";
    button.addEventListener("click", () => {
      startBatchUpload().catch(error => {
        console.error("❌ 批量上传失败", error);
        alert(`批量上传失败: ${error.message}`);
      });
    });
    document.body.appendChild(button);
  }

  renderStartButton();
  window.startTrip7BatchUpload = startBatchUpload;
  console.log("✅ Trip7 批量上传脚本已就绪，点击右下角按钮开始");
})();
