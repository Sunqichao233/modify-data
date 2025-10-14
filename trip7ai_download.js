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
    { user: "summittechnic006", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic009", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic010", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic011", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic012", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic013", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic014", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic016", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic017", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic018", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic019", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic020", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic021", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic022", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic023", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic024", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic025", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic026", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic027", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic028", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic029", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic030", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic031", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic032", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic033", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic034", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic035", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic036", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic037", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic038", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic040", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic041", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic042", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic045", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic046", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic047", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic048", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic050", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic051", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic052", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic053", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic055", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic056", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic057", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic058", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic059", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic060", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic061", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic062", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic063", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic064", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic065", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic066", course: "AIサーバー構築実戦コース" },
    { user: "summittechnic067", course: "AIサーバー構築実戦コース" },
    { user: "SunInfo001", course: "AIサーバー構築実戦コース" },
    { user: "SunInfo003", course: "AIサーバー構築実戦コース" },
    { user: "SunInfo004", course: "AIサーバー構築実戦コース" },
    { user: "SunInfo005", course: "AIサーバー構築実戦コース" },
    { user: "SunInfo006", course: "AIサーバー構築実戦コース" },
    { user: "SunInfo007", course: "AIサーバー構築実戦コース" },
    { user: "edchihatu006", course: "AIサーバー構築実戦コース" },
    { user: "edchihatu009", course: "AIサーバー構築実戦コース" },
    { user: "edchihatu010", course: "AIサーバー構築実戦コース" },
    { user: "amistrong004", course: "AIデータサイエンス中級コース" },
    { user: "amistrong005", course: "AIデータサイエンス中級コース" },
    { user: "amistrong006", course: "AIデータサイエンス中級コース" },
    { user: "amistrong008", course: "AIデータサイエンス中級コース" },
    { user: "ydminnovation001", course: "AIデータサイエンス中級コース" },
    { user: "bestSolutions005", course: "AIプログラミング中級コース" },
    { user: "bestSolutions008", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions001", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions002", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions006", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions008", course: "AIプログラミング中級コース" },
    { user: "dynamics001", course: "AIプログラミング中級コース" },
    { user: "dynamics004", course: "AIプログラミング中級コース" },
    { user: "dynamics009", course: "AIプログラミング中級コース" },
    { user: "dynamics010", course: "AIプログラミング中級コース" },
    { user: "ipsconsult007", course: "AIプログラミング基礎コース" },
    { user: "ipsconsult008", course: "AIプログラミング基礎コース" },
    { user: "ipsconsult009", course: "AIプログラミング基礎コース" },
    { user: "ipsconsult010", course: "AIプログラミング基礎コース" },
    { user: "ipsconsult011", course: "AIプログラミング基礎コース" },
    { user: "ipsconsult012", course: "AIプログラミング基礎コース" },
    { user: "ipsconsult013", course: "AIプログラミング基礎コース" },
    { user: "ipsconsult014", course: "AIプログラミング基礎コース" },
    { user: "ipsconsult016", course: "AIプログラミング基礎コース" },
    { user: "ipsconsult017", course: "AIプログラミング基礎コース" },
    { user: "typesafe002", course: "AIサーバー構築基礎コース" },
    { user: "summittechnic004", course: "AIサーバーのDX化活用実戦コース" },
    { user: "summittechnic005", course: "AIサーバーのDX化活用実戦コース" },
    { user: "snssoft001", course: "AIサーバーのDX化活用実戦コース" },
    { user: "snssoft002", course: "AIサーバーのDX化活用実戦コース" },
    { user: "summittechnic008", course: "大規模言語モデル" }
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
