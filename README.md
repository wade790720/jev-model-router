# JEV Model Router（第二版原型）

這是獨立製作的 Chrome／Edge 擴充功能，不是 OpenAI 或 TypeSafe AI 的官方產品。支援 `chatgpt.com`「對話」與「工作」模式的文字草稿；**不支援原生桌面 App、附件或圖片內容**。

使用者停下輸入約 950 毫秒後，擴充功能會把保留換行與縮排的草稿文字送給 TypeSafe AI 的 Jev，優先判斷完成任務所需的品質，再於預期品質相近時選較快、較省的模型。輸入框右上方以 200px Alert 顯示狀態與最多三個候選機率；信心不足時保留目前模型並亮黃燈顯示建議，其餘情況嘗試切換網頁模型。長狀態會換行、不裁切。Alert 跟隨 ChatGPT 明暗主題；Alert 與設定頁跟隨瀏覽器介面語言（繁中、簡中、英文、日文、韓文，其餘回退英文）。「對話」模式推薦 Instant／Medium／High／Pro；「工作」模式推薦目前主力 Luna、Sol、Astra 的六種模型／推理強度組合，其中 Luna 使用輕度推理。若工作模型已切換但推理強度無法自動調整，會亮黃燈請使用者手動調整；模型也未切換則亮紅燈。使用者手動改選後，同一模式的當次草稿不再干預；切換對話／工作模式會重新判斷。

兩種接入方式：

- 自備 TypeSafe API key：直接從瀏覽器呼叫 TypeSafe，無需本服務訂閱。
- US$5／月：透過 Cloudflare Worker 轉送，以 Stripe Checkout 收費、啟用碼驗證；無固定月次數上限，但有公開的合理使用與反濫用限制。

快速開始、Cloudflare／Stripe 部署、限制與待提供資訊見 [設定說明](docs/SETUP.md)。資料處理方式見 [隱私說明](docs/PRIVACY.md)。

本原型依照 [TypeSafe API](https://docs.typesafe.ai/api) 的 Choice `probabilities` 與 [OpenAI Work 模型文件](https://learn.chatgpt.com/docs/models?surface=app) 設計；Alert 採用 [shadcn/ui Base Alert](https://ui.shadcn.com/docs/components/base/alert) 的組合與視覺樣式，但為維持無建置的 Chrome content script，以原生 DOM/CSS 實作。ChatGPT 網頁 DOM 並非穩定 API，仍需在實際帳號與方案上驗收。OpenAI Responses API 不會控制使用者既有的 ChatGPT 網頁對話或模型選單。
