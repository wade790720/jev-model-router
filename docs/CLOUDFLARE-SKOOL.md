# Cloudflare Worker：錯誤收件箱

擴充功能 0.5 起免費、使用者自備 TypeSafe 金鑰，沒有託管服務。Worker（`worker/`，網域 router.tekuei.com）現在只負責一件事：接收三個擴充功能（ig-sorter、brand-digest、jev-model-router）送來的錯誤報告，讓每天的 AI 例行工作讀取。

舊的託管推薦、Skool 會員登入、session、用量上限都已從程式移除。0.4.0 審核通過但沒有公開，沒有任何使用者受影響。

## 路由

| 路由 | 用途 | 驗證 |
| --- | --- | --- |
| `GET /api/health` | 回傳 `{ ok, service: "error-inbox", intakeReady, adminReady }`。`intakeReady` 表示 D1 已綁定；`adminReady` 另外要求 `ERRORS_ADMIN_SECRET` 至少 32 字元。 | 不需要 |
| `POST /api/errors` | 收錯誤報告（text/plain 簡單請求，擴充功能不需要 host permission）。只收三個工具，有大小與每日新種類上限。 | 不需要 |
| `GET /api/admin/errors?status=new\|seen` | 列出錯誤。 | Bearer `ERRORS_ADMIN_SECRET` |
| `POST /api/admin/errors/ack` | 把錯誤標成已處理。 | Bearer `ERRORS_ADMIN_SECRET` |

其他路徑一律 404，包括舊的 `/api/route`、`/api/session`、`/api/admin/members`。

排程（`wrangler.jsonc` 的 cron `0 3 * * *`，每天一次）只刪除 90 天沒再出現的錯誤種類。

程式：`worker/src/skool.ts`（入口）、`worker/src/errors.ts`（收件箱）、`worker/src/errors.test.ts`。

## Secrets

**保留**

- `ERRORS_ADMIN_SECRET`：每天的 AI 例行工作用它讀取與確認錯誤。

**可以刪除**（程式已不再讀取。只列出來，沒有代刪；確認不再需要回到舊版後再刪）

- `TYPESAFE_API_KEY`：舊託管推薦用來呼叫 TypeSafe。
- `MEMBER_HASH_SECRET`：舊 Skool 會員識別的 HMAC 金鑰。
- `ADMIN_SYNC_SECRET`：舊 `/api/admin/members` 的管理者金鑰。
- 如果還留著 0.2 時期的 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`，也可以刪除。

刪除指令（在 `worker/` 資料夾）：

```powershell
npx wrangler@latest secret list
npx wrangler@latest secret delete TYPESAFE_API_KEY
npx wrangler@latest secret delete MEMBER_HASH_SECRET
npx wrangler@latest secret delete ADMIN_SYNC_SECRET
```

## 資料庫

D1 `jev-model-router` 的資料表都沒有動。收件箱只用 `error_reports`（`migrations/0002_errors.sql`）。舊的 `members`、`member_sessions`、`usage_windows`、`licenses` 還留在資料庫裡，程式已不再讀寫，之後再決定要不要刪。

## 部署

```powershell
Set-Location C:\Users\Wade_TPE\Documents\jev-model-router\worker
npx wrangler@latest deploy
```

部署後確認 `https://router.tekuei.com/api/health` 回傳 `"service": "error-inbox"`，且 `intakeReady`、`adminReady` 都是 `true`。
