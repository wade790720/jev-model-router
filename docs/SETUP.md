# 安裝與部署

## 1. 先試自備 API key（不需 Cloudflare／Stripe）

1. 在 Chrome 開啟 `chrome://extensions`，或 Edge 開啟 `edge://extensions`，啟用「開發人員模式」。
2. 點「載入未封裝項目」，選擇本專案的 `extension` 資料夾。
3. 開啟擴充功能設定，選「自備 TypeSafe API key」，貼上自己的 key，按「儲存設定」。
4. 在 `chrome://extensions` 找到「ChatGPT 智慧選模型」（英文瀏覽器顯示 Smart ChatGPT），按「重新載入」，再重新整理 `https://chatgpt.com/`。在「對話」輸入框打字，停下約 950 毫秒後應看到靠右 Alert、綠／黃／紅狀態燈與最多三個候選機率。
5. 在「對話」模式先輸入文字，不清空輸入框就切到「工作」模式；確認會重新判斷並切換，而非沿用對話模式的結果。若推薦 Luna，核對模型與「輕度」推理強度。若模型已切換但推理強度仍不同，應看到黃燈提示手動調整；模型也未切換才顯示紅燈。手動切換一次，確認同一模式的本草稿不再被擴充功能改回。
6. 在 ChatGPT 外觀設定改為淺色，確認 Alert 背景與文字跟著變為淺色系；再改回原本設定。

這一階段只需 [TypeSafe API key](https://docs.typesafe.ai/api)。自備 key 的 TypeSafe API 用量由使用者自行負擔，並非免費 Jev 服務。

## 2. 啟用 US$5／月訂閱

需要 Cloudflare Workers + D1、TypeSafe API key、Stripe 帳號。先以 Stripe test mode 驗證，**不要在未完成退款、客服、隱私與服務條款頁面前公開收費**。

1. 在 Stripe 建立每月 US$5 的 recurring Price，記下 `price_...`。啟用 Stripe Checkout；想讓訂戶使用 Link，可在 Stripe 支付方式設定中啟用，這不需要另外串接 Link API。
2. 在 Stripe 啟用 [Customer Portal](https://docs.stripe.com/customer-management/activate-no-code-customer-portal)，至少允許取消訂閱。取得 secret key `sk_...`。
3. 安裝 Node.js 後，在 `worker` 目錄執行 `npx wrangler login`、`npx wrangler d1 create jev-model-router`，將回傳的 D1 database ID 寫入 `wrangler.jsonc`，並把 `STRIPE_PRICE_ID` 改成上述 Price ID。
4. 執行 `npx wrangler d1 execute jev-model-router --remote --file=schema.sql` 建表。之後執行 `npx wrangler secret put TYPESAFE_API_KEY`、`npx wrangler secret put STRIPE_SECRET_KEY`、`npx wrangler secret put STRIPE_WEBHOOK_SECRET`，分別輸入各自金鑰。不要把金鑰寫進 `wrangler.jsonc` 或提交至版本控制。
5. 執行 `npx wrangler deploy`，記下 `https://...workers.dev` 網址。Stripe test mode 建立 webhook，URL 設為 `<Worker URL>/api/stripe-webhook`，至少訂閱 `customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted`，將 webhook signing secret 設為上述 `STRIPE_WEBHOOK_SECRET` 後重新部署。
6. 在擴充功能設定選「US$5／月訂閱」，填 Worker 根網址，按「前往訂閱」。完成測試付款，從成功頁複製啟用碼，回設定頁貼上並儲存。按「管理／取消訂閱」應能開啟 Stripe Customer Portal。

`worker/.dev.vars.example` 是本機變數格式範例；正式部署使用 Cloudflare secrets。沒有上述帳號與金鑰時，本專案只能完成程式測試，不能代替你部署或執行真實付款。

## 使用與收費邊界

- 訂閱費為本路由服務，不包含 ChatGPT 訂閱、API 使用權，也不保證某個 ChatGPT 選項對每位使用者開放。
- 目前沒有固定「每月可判斷幾次」的配額；為反濫用，每個訂戶上限預設為每分鐘 20 次、每天 3,000 次，且每天 Jev 輸入 token 上限為 2,000,000。超過會暫停至下一個 UTC 日／分鐘窗口。部署者可調整 Worker 變數，但應先更新對外條款。
- 每個 IP 每 10 分鐘最多建立 5 次 Stripe Checkout Session；另有服務整體每日 token 安全上限。
- 模型建議是啟發式判斷，不保證最佳答案；Jev 對中文等 CJK 文字的準確度可能低於英文。[TypeSafe 說明](https://docs.typesafe.ai/concepts/state)
- 路由會先考慮任務所需的正確性、完整性與判斷品質；預期品質相近時才優先選較快、較省的選項。草稿的換行與縮排會保留給 Jev 判斷。
- 低信心（`confidence < 0.45`）時，保留使用者目前選的模型，不自動切換；Alert 亮黃燈顯示建議，使用者可自行確認或調整。候選百分比使用 TypeSafe `probabilities`，不把 `confidence` 冒充為機率。
- ChatGPT 網頁選單不是對外穩定的模型切換 API。若網頁改版、使用者方案不含該選項，或擴充功能無法確認切換，就提示手動選擇。本原型不處理桌面 App。
- 「工作」模式支援目前主力模型的六種預設組合；選單中的舊版模型不自動推薦。模型／推理強度控制與方案權限可能改變，因此無法確認的組合會亮紅燈交由使用者手動處理。
- 已登入的 ChatGPT 網頁可觀察到輸入框旁的模型／推理強度滑桿；程式同時保留舊式選單項目的降級處理。此結構可能因方案與改版而不同；每次修改擴充功能後，仍需重新載入並人工驗收真實自動切換。

## 測試

在專案根目錄執行 `npm run check` 與 `npm test`。測試涵蓋 Jev 請求／機率回應、基本模型選擇、Stripe webhook 簽章、訂閱驗證、用量記帳、結帳限流與延遲 webhook。**這些是模擬測試**；真實 ChatGPT DOM、TypeSafe 金鑰與 Stripe 付款需要依上面步驟再做人工端對端驗收。

## 公開發佈前仍需你提供／決定

- TypeSafe API key 與可否公開商用的帳號設定。
- Cloudflare 帳號、D1 database ID、Worker 正式網域（可先用 `workers.dev`）。
- Stripe 帳號、每月 US$5 Price ID、secret key、webhook secret、Customer Portal 設定。
- 產品名稱／圖示、客服聯絡信箱、退款政策、隱私權政策與服務條款網址。Chrome Web Store 公開上架通常需要這些資料與權限說明。
- 用一個實際登入的 ChatGPT 網頁帳號驗收模型選單；不同方案、語系可能顯示不同選項。

官方參考：[TypeSafe API](https://docs.typesafe.ai/api)、[Cloudflare Wrangler／D1](https://developers.cloudflare.com/d1/get-started/)、[Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Stripe Checkout 訂閱](https://docs.stripe.com/billing/subscriptions/build-subscriptions?platform=web)、[Stripe Webhook](https://docs.stripe.com/webhooks)。
