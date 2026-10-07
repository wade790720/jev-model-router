# Cloudflare + Skool：部署準備與發布閘門

目前是可在本機驗證的後端基礎，不是已部署或完整會員登入。

## 還需要的營運設定

- 網域與實際子網域，例如 router.your-domain（請提供真實名稱，程式不猜）。
- Skool 社群網址與方案。官方 Zapier 文件只列付費會員姓名/email 觸發，未在該頁保證取消/到期事件；請確認後台可取得的欄位及持續有效會員狀態。
- email 所有權驗證的寄信服務、寄件網域與 Secrets；不能只輸入 email 就核發 session。
- 最終額度、成本上限與同步間隔。現有 request/day 與 token/day 是測試保護，不等於保證無限用量；token 使用量是上游完成後記帳，並發時可能超越門檻，公開發布前需預留額度與全域請求限制。

參考：[Skool 官方整合](https://help.skool.com/article/56-zapier-integration)（目前只在 Pro 方案提供）。

## 部署步驟（尚未代執行）

PowerShell 進入專案的 worker 資料夾；Wrangler 是部署工具，初次 npx 需要下載。

```powershell
Set-Location C:\Users\Wade_TPE\Documents\jev-model-router\worker
npx wrangler@latest login
npx wrangler@latest d1 create jev-model-router
```

將建立出的 database_id 填入 wrangler.jsonc 的 DB 綁定；不要另建同名重複綁定。

先本機驗證表結構：

```powershell
npx wrangler@latest d1 execute DB --local --file=schema.sql
npx wrangler@latest d1 migrations apply DB --local
npx wrangler@latest dev
```

本機 Secrets 放 .dev.vars（已忽略）；參照 .dev.vars.example。不要把 Key 貼進聊天、指令參數、Git 或擴充功能。

確認目標帳號/資料庫後才初始化遠端：

```powershell
npx wrangler@latest d1 execute DB --remote --file=schema.sql
npx wrangler@latest d1 migrations apply DB --remote
npx wrangler@latest secret put TYPESAFE_API_KEY
npx wrangler@latest secret put ADMIN_SYNC_SECRET
npx wrangler@latest secret put MEMBER_HASH_SECRET
npx wrangler@latest deploy
```

兩個管理/HMAC Secret 必須不同、隨機且至少32字元。HMAC Secret 不能隨意旋轉，否則既有會員識別無法對上。Secrets 透過互動輸入，不留 shell history。

設定自訂網域：Cloudflare Workers & Pages → 該 Worker → Settings → Domains & Routes → Custom Domain。或在 wrangler.jsonc 加 routes 的 custom_domain=true（僅填已確認網域，不覆蓋既有用途）。

確認 /api/health，再將 https 服務根網址及 Skool 網址填進 extension/service-config.js；不含 Key。一般使用者不需自行填服務網址。

官方：[D1 建立與綁定](https://developers.cloudflare.com/d1/get-started/)、[Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[自訂網域](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

## 目前 API 與內部測試

- GET /api/health：回傳 signInReady=false，不代表所有上游與 Secrets 正常。
- POST /api/route：Bearer session，資格有效且有餘額才呼叫 TypeSafe。
- POST /api/admin/members：只給管理者，Bearer ADMIN_SYNC_SECRET。JSON 欄位 email、status（active/inactive）、validUntil（Unix秒）及可選 issueToken（預設false）。
- 管理者核對付費狀態後，issueToken=true 才核發內部測試 token；不自動寄送、不將 Secret 下放套件。回傳明文 token 只此一次，由管理者安全交付自己測試。
- validUntil 最多35天，必須持續更新；不代表續訂推定。inactive 即時阻止所有該會員 session。session 到期需重新核發，延長會員資格不延長舊 session。
- Stripe checkout/portal/webhook 和 public login 均不提供，預設404。錯誤不記錄請求body或私鑰。

## 正式發布前必須通過

1. 驗證碼：email所有權、一次性、期限、錯誤次數、寄送/IP/全域頻率限制、無會員枚舉、email變更/登出/session撤銷。
2. Skool 同步：核對誰是有效付費會員；免費加入不能授權。驗證取消、付款失敗、到期、重複與乱序事件、既有會員匯入及同步中斷的 fail-closed 規則。
3. 公開使用者介面改為正式登入，移除內部測試入口；目前按登入會誠實提示尚未準備好。
4. 用量與成本並發壓測、Cloudflare/TypeSafe 真實服務端到端測試、正式隱私政策與客服。
5. 在 Chrome/Edge 真實帳號驗證文字輸入、IME、主題、對話/工作模式與正常送出。測試不會重整使用中的分頁。

以上缺件確認前，僅內部測試，不宣稱 Skool 自動會員登入已完成。
