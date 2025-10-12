// 实现了批处理下载指定数据

(async () => {
  console.log("🚀 Trip7 批量フィルター＆CSVダウンロード 開始");

  // === 🧩 在这里填写要批量下载的用户名与课程名 ===
  const tasks = [
    { user: "bestSolutions001", course: "AIプログラミング中級コース" },
    { user: "bestSolutions002", course: "AIプログラミング中級コース" },
    { user: "bestSolutions003", course: "AIプログラミング中級コース" },
    { user: "bestSolutions004", course: "AIプログラミング中級コース" },
    { user: "bestSolutions005", course: "AIプログラミング中級コース" },
    { user: "bestSolutions008", course: "AIプログラミング中級コース" },
    { user: "bestSolutions009", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions001", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions002", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions003", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions004", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions005", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions006", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions008", course: "AIプログラミング中級コース" },
    { user: "NovaSolutions010", course: "AIプログラミング中級コース" },
    { user: "dynamics001", course: "AIプログラミング中級コース" },
    { user: "dynamics002", course: "AIプログラミング中級コース" },
    { user: "dynamics003", course: "AIプログラミング中級コース" },
    { user: "dynamics004", course: "AIプログラミング中級コース" },
    { user: "dynamics005", course: "AIプログラミング中級コース" },
    { user: "dynamics006", course: "AIプログラミング中級コース" },
    { user: "dynamics007", course: "AIプログラミング中級コース" },
    { user: "dynamics008", course: "AIプログラミング中級コース" },
    { user: "dynamics009", course: "AIプログラミング中級コース" },
    { user: "dynamics010", course: "AIプログラミング中級コース" },
    { user: "dynamics011", course: "AIプログラミング中級コース" }
  ];

  // === 🧠 核心执行函数 ===
  async function downloadOne(targetValue) {
    console.log(`\n🚀 開始処理: ${targetValue}`);

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

    csvItem.click();
    console.log(`✅ CSVダウンロード をクリックしました -> ${targetValue}`);
  }

  // === 🚀 循环执行所有任务 ===
  for (const task of tasks) {
    const value = `${task.user}#${task.course}`;
    await downloadOne(value);
    console.log(`⏳ 等待 6 秒后执行下一个...`);
    await new Promise(r => setTimeout(r, 6000)); // 每个任务间隔 6 秒
  }

  console.log("🏁 全部処理完了！");
})();
