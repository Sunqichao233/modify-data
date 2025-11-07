// 实现了批处理下载指定数据的脚本，并且实现命名为 userName#course.csv



(async () => {
  console.log("🚀 Trip7 批量フィルター＆CSVダウンロード 開始");

  // === 🆕 下载命名 Hook（非 Blob 方案）===
  // 拦截 <a>.click()，当指向 blob: 时，自动设置下载文件名为 当前任务名.csv
  // 这个方式不改动 Blob，兼容性更高，也不会引起递归/重复下载
  (function injectDownloadRenameHook() {
    if (window.__anchorClickPatched) return; // 防止重复注入
    const OriginalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (...args) {
      try {
        // 只有在页面触发 blob 下载，且我们预先设置了当前文件名时才改名
        if (this.href && this.href.startsWith("blob:") && window.__currentFileName) {
          const expectExt = ".csv";
          // 如果站点本身未设置 download 或设置成默认名，我们覆盖为 “userName#course.csv”
          const desired = window.__currentFileName.endsWith(expectExt)
            ? window.__currentFileName
            : window.__currentFileName + expectExt;
          this.setAttribute("download", desired);
          console.log("📝 已设置下载文件名:", desired);
        }
      } catch (e) {
        console.warn("⚠️ 下载命名 Hook 处理异常:", e);
      }
      return OriginalAnchorClick.apply(this, args);
    };
    window.__anchorClickPatched = true;
    console.log("✅ 下载命名 Hook 已启用（非 Blob 方案）");
  })();

  // === 🧩 在这里填写要批量下载的用户名与课程名 ===
const tasks = [
  { user: "caroatf002", course: "生成AI活用（Copilot）" },
  { user: "caroatf003", course: "生成AI活用（Copilot）" },
  { user: "caroatf004", course: "生成AI活用（Copilot）" },
  { user: "caroatf005", course: "生成AI活用（Copilot）" },
  { user: "caroatf006", course: "生成AI活用（Copilot）" },
  { user: "caroatf007", course: "生成AI活用（Copilot）" },
  { user: "caroatf009", course: "生成AI活用（Copilot）" },
  { user: "caroatf010", course: "生成AI活用（Copilot）" },
  { user: "caroatf011", course: "生成AI活用（Copilot）" },
  { user: "caroatf012", course: "生成AI活用（Copilot）" },
  { user: "caroatf015", course: "生成AI活用（Copilot）" },
  { user: "caroatf016", course: "生成AI活用（Copilot）" },
  { user: "caroatf017", course: "生成AI活用（Copilot）" },
  { user: "caroatf018", course: "生成AI活用（Copilot）" },
  { user: "caroatf019", course: "生成AI活用（Copilot）" },
  { user: "caroatf020", course: "生成AI活用（Copilot）" },
  { user: "caroatf021", course: "生成AI活用（Copilot）" },
  { user: "caroatf022", course: "生成AI活用（Copilot）" },
  { user: "caroatf023", course: "生成AI活用（Copilot）" },
  { user: "caroatf024", course: "生成AI活用（Copilot）" },
  { user: "caroatf026", course: "生成AI活用（Copilot）" },
  { user: "caroatf027", course: "生成AI活用（Copilot）" },
  { user: "caroatf028", course: "生成AI活用（Copilot）" },
  { user: "caroatf029", course: "生成AI活用（Copilot）" },
  { user: "caroatf030", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf031", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf032", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf033", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf034", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf035", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf036", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf037", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf038", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf039", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf040", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf041", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf042", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf043", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf044", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf045", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf046", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf047", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf048", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf049", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf050", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf051", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf052", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf053", course: "生成AI活用（ChatGPT）" },
  { user: "caroatf054", course: "生成AI活用（ChatGPT）" }
];

  // === 🧠 核心执行函数 ===
  async function downloadOne(targetValue, currentFileName) {
    console.log(`\n🚀 開始処理: ${targetValue}`);

    // 🆕 将当前文件名保存到全局，供“下载命名 Hook”使用
    // 约定命名：userName#categoryName.csv
    window.__currentFileName = currentFileName;

    // Step 1. 打开“フィルター”面板
    const filterBtn = document.querySelector('button[aria-label="フィルター表示"]');
    if (!filterBtn) {
      console.error("❌ 找不到フィルター按钮");
      return;
    }
    filterBtn.click();
    console.log("✅ フィルター面板を開きました");

    // Step 2. 等待组件加载
    let selectCol, selectOp, inputBox;
    for (let i = 0; i < 60; i++) {
      selectCol = [...document.querySelectorAll("select")].find(s =>
        [...s.options].some(opt => opt.value === "userName#categoryName")
      );
      selectOp = [...document.querySelectorAll("select")].find(s =>
        [...s.options].some(opt => opt.value === "contains")
      );
      inputBox = document.querySelector('input[placeholder="値を入力..."]');
      if (selectCol && selectOp && inputBox) break;
      await new Promise(r => setTimeout(r, 100));
    }

    if (!selectCol || !selectOp || !inputBox) {
      console.error("❌ 未找到筛选组件，请确认面板已打开。");
      return;
    }

    // Step 3. 设置列与运算符
    selectCol.value = "userName#categoryName";
    selectCol.dispatchEvent(new Event("change", { bubbles: true }));
    selectOp.value = "contains";
    selectOp.dispatchEvent(new Event("change", { bubbles: true }));

    // Step 4. 输入值并触发 React 更新
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    inputBox.focus();
    nativeSetter.call(inputBox, targetValue);
    inputBox.dispatchEvent(new Event("input", { bubbles: true }));
    inputBox.dispatchEvent(new Event("change", { bubbles: true }));

    const enterEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13
    });
    inputBox.dispatchEvent(enterEvent);
    inputBox.blur();

    console.log("✅ 値を入力しました（React 状态已更新并提交）");

    // Step 5. 等待数据刷新
    await new Promise(r => setTimeout(r, 4000));

    // Step 6. 打开导出菜单
    const exportBtn = document.querySelector('button[aria-label="エクスポート"]');
    if (!exportBtn) {
      console.error("❌ 找不到エクスポート按钮");
      return;
    }
    exportBtn.click();
    console.log("✅ エクスポートメニューを開きました");

    // Step 7. 等待并点击“CSVダウンロード”
    let csvItem;
    for (let i = 0; i < 50; i++) {
      csvItem = [...document.querySelectorAll("li.MuiMenuItem-root")].find(
        li => li.textContent.includes("CSVダウンロード")
      );
      if (csvItem) break;
      await new Promise(r => setTimeout(r, 100));
    }

    if (!csvItem) {
      console.error("❌ 未找到 CSVダウンロード 菜单项");
      return;
    }

    // ⚠️ 关键：站点会在这里立刻创建 blob 并调用 a.click() 触发下载
    // 我们上面注入的“下载命名 Hook”会在 a.click() 发生前把文件名改成 __currentFileName
    csvItem.click();
    console.log(`✅ CSVダウンロード をクリックしました -> ${targetValue}`);

    // （可选）等待一小会儿，确保该次下载完成
    await new Promise(r => setTimeout(r, 500));
  }

  // === 🚀 循环执行所有任务 ===
  for (const task of tasks) {
    const value = `${task.user}#${task.course}`;
    const fileName = `${task.user}#${task.course}`; // 不带后缀，Hook 内部会补 ".csv"
    await downloadOne(value, fileName);
    console.log(`⏳ 等待 6 秒后执行下一个...`);
    await new Promise(r => setTimeout(r, 6000)); // 每个任务间隔 6 秒
  }

  console.log("🏁 全部処理完了！");
})();
