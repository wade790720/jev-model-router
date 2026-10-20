# 0.5 資料處理說明

對外的隱私權政策見根目錄的 [PRIVACY.md](../PRIVACY.md)。這份是給維護者的實作對照。

- **金鑰**：使用者自己的 TypeSafe API 金鑰存在 `chrome.storage.local` 的 `typeSafeKey`，不是加密保險箱。只送到 `api.typesafe.ai`。
- **驗證**：「驗證並儲存」會呼叫 `GET https://api.typesafe.ai/v1/models`（`src/lib/settings.ts`），只帶金鑰，不帶文字，不花額度。
- **草稿**：輸入停頓約 950ms 後，目前的文字草稿由 service worker 直接送到 `https://api.typesafe.ai/v1/systemone`（`src/lib/route-draft.ts`）。不讀取聊天歷史、附件、圖片。沒有金鑰就不送。
- **引導進度**：第一次成功產生建議時，在 `chrome.storage.local` 記下 `firstSuggestionAt`（毫秒時間戳），只用來完成設定頁的第 3 步。
- **錯誤報告**：`src/lib/error-log.ts`，送到 `https://router.tekuei.com/api/errors`。這是 text/plain 的簡單請求（`mode: "no-cors"`），不需要 host permission。內容規則見該檔註解；使用者可在設定頁關閉。
- **沒有的東西**：沒有託管服務、沒有 cookie 權限、沒有 Skool 會員檢查、沒有本機診斷。權限只有 `storage`、`https://chatgpt.com/*`、`https://api.typesafe.ai/*`。
- `worker/` 伺服器另行處理；擴充功能 0.5 起只用到它的錯誤收件匣。
