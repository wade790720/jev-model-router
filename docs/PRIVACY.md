# 0.3 資料處理說明（仍非正式發布政策）

- 接入設定完成且擴充功能啟用時，預設在輸入停頓約 950ms 後分析目前文字草稿；不另設同意勾選框，不需按 ChatGPT 送出。設定頁保留資料流向說明；停用擴充功能可停止後續分析。不讀取聊天歷史、附件、圖片。
- 自備 Key：草稿直接傳至 TypeSafe；Key 存在瀏覽器 `storage.local`，不是加密保險箱。
- 託管：草稿與 session token 經 Cloudflare Worker 轉至 TypeSafe；程式不將全文寫入 D1 或刻意記錄應用日誌。平台與 TypeSafe 仍依各自政策處理請求。
- 新 Skool 入口：內部管理者以已核對會員的 email 設定資格。Worker 只儲存 email 的 keyed HMAC、有效狀態、資格期限、更新時間；不儲存姓名或明文 email。email 仍會經網路到達 Worker，不可稱完全匿名。
- session 僅存 token 的 SHA-256 雜湊與期限；member valid_until 和 session expires_at 每次推薦均檢查。過期 session 由排程清理，七天前用量窗口清理。
- 舊 Stripe licenses 表不自動刪除，也不由新 Worker 入口使用。新入口沒有付款資訊處理、Stripe 路由或 Skool 密碼收集。
- 本機診斷維持測試版預設開啟；可關閉。不含草稿／Key，只送這台電腦本機收集器。0.3 完成事件標記為 suggested，不是 switching success。見 [DIAGNOSTICS.md](DIAGNOSTICS.md)。
- 目前 email 登入／寄信與 Skool 自動同步尚未完成。不得公開收費發布；須先驗證新會員、取消、到期、同步中斷與資料刪除流程。
- 正式發布前補實際營運者、聯絡方式、會員與診斷保存期限、刪除／查詢方法、Cloudflare／TypeSafe／Skool 政策連結與寄信服務資料處理說明。
