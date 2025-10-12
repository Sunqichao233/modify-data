// 2025/1013 成功实现了能下载一个指定的userid和courseid的脚本


(async () => {
  console.log("🚀 Trip7 自動フィルター＆CSVダウンロード 開始");

  const targetValue = "softusing001#AIサーバー構築実戦コース";

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
  console.log("✅ 列/オペレータ 設定完了");

  // Step 4. 输入值（使用原生 setter 修复 React 不响应问题）
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  inputBox.focus();
  nativeSetter.call(inputBox, targetValue);
  inputBox.dispatchEvent(new Event("input", { bubbles: true }));
  inputBox.dispatchEvent(new Event("change", { bubbles: true }));

  // 模拟 Enter 提交
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
  await new Promise(r => setTimeout(r, 3500));

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
  console.log("✅ CSVダウンロード をクリックしました");
})();
