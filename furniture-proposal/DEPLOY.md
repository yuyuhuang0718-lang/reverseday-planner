# 發布可操作 Demo

互動 Demo 已置於 `furniture-proposal/index.html`，另有同內容的 `demo.html`。無建置步驟或外部套件。

## GitHub Pages 初次設定

1. 開啟 https://github.com/yuyuhuang0718-lang/reverseday-planner/settings/pages
2. 在 **Build and deployment** 的 **Source** 選擇 **Deploy from a branch**。
3. Branch 選擇 **project-proposal**，Folder 選擇 **/(root)**，按下 **Save**。
4. 等待 GitHub Pages 建置完成。

啟用完成後的預期 Demo 網址：

https://yuyuhuang0718-lang.github.io/reverseday-planner/furniture-proposal/

上方網址需先完成 Pages 啟用與建置，並非僅推送程式就保證已上線。

## 無需架站的單檔版本

下載同資料夾的 `standalone.html`，以一般瀏覽器開啟即可展示。CSS、幾何引擎與互動程式均已內嵌，不需要安裝套件。

## 已驗證能力

- 實際拖曳、四方向旋轉、尺寸與座標修改。
- 家具相撞、使用範圍阻擋、越界及同時使用提醒。
- 範例正確偵測抽屜與床重疊 20 公分，移位後解除。
- 復原／重做、瀏覽器保存、JSON 匯入匯出、PNG 圖片下載。
- 360、390、768、1440px 畫面無水平溢出。

單元驗證：`node --test --test-isolation=none furniture-proposal/room-engine.test.cjs`。

第一版使用手動尺寸與矩形幾何，不包含高度、門片及完整通道可達性判斷。
