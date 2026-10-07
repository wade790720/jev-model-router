# 本機診斷與每日修復（0.2.8 測試版）

這一版為開發者自己密集測試設計，預設開啟本機診斷，設定頁可關閉。不向 TypeSafe、GitHub 或任何雲端診斷服務上傳記錄。公開發布前應改為預設關閉、由使用者自行選擇；本機收集器也不是公開版的遠端回報服務。

## 使用

1. 啟動本機收集器：Windows 執行 `powershell -File scripts/start-diagnostics.ps1`；其他平台執行 `npm run diagnostics:collect`。Windows helper 會在背景啟動 Node，沒有可見終端視窗。
2. 到 `chrome://extensions` 或 `edge://extensions` 重新載入擴充功能，然後重新整理既有 ChatGPT 分頁。
3. 設定頁「本機診斷」應顯示「收集器已連線」。照常使用即可。
4. 執行 `npm run diagnostics:summary` 查看近 14 天按套件版本、模式、推薦目標、步驟、錯誤碼分組的統計。也可在設定頁匯出瀏覽器最近的記錄。

收集器只綁定 `127.0.0.1:43127`，接受擴充功能来源的 JSON；頁面來源不能 POST。記錄寫入 `.local/diagnostics/YYYY-MM-DD.jsonl`（UTC 日期），由 `.gitignore` 排除。沒有自動開機啟動；重新開機後執行 helper，或由每日檢查任務啟動。埠號不能改成對外監聽。

## 收集內容與界限

只允許固定欄位：套件／瀏覽器版本、語系、模式、推薦目標、前後已知模型、推理強度、失敗步驟／錯誤碼、耗時、介面存在旗標、選單項目數及最多 12 個已知模型名稱。另有隨機事件 ID、事件及接收時間。失敗時保留最後操作步驟的介面存在旗標，避免關閉選單後失去線索。

**不收集**草稿、對話、圖片、附件、Email、API Key、頁面網址、對話 ID、截圖、完整 DOM、任意按鈕文字、任意錯誤訊息或 stack。未知模型標為 `unknown`。資料會在擴充功能及收集器各過濾一次。記錄包含成功、失敗、部分成功、僅推薦與取消，用來建立正確的成功率分母。

瀏覽器保留最近 300 筆記錄和最多 300 筆待送佇列，最近 14 天結果計數。收集器離線時不影響草稿判斷；恢復後每分鐘嘗試重送，每批最多 40 筆，按 ID 去重。滿佇列時會淘汰最舊的待送事件，因此這是盡力收集而非無損日誌。磁碟每個 UTC 日最多接受 5,000 個唯一事件；這個上限可能使超量事件保持待送。

## 失敗分類

| 錯誤码 | 意義 |
|---|---|
| `routing_consent` | 尚未同意文字草稿分析；沒有發送草稿 |
| `routing_key_missing` | 自備模式未填 Key |
| `routing_service_unconfigured` | 託管服務網址尚未設定 |
| `routing_membership_missing` | 尚未設定會員憑證 |
| `trigger_missing` | 找不到模型選擇按鈕 |
| `menu_missing` | 無法開啟或讀到模型選單 |
| `target_missing` | 選單沒有推薦的工作模型 |
| `slider_missing` / `slider_invalid` | 推理強度控制器缺少或數值不完整 |
| `verification_failed` | 無法確認模型已切換 |
| `effort_failed` | 模型已更換，但強度未能驗證 |
| `surface_changed` | 等待回應時對話／工作模式改變，舊結果取消 |
| `routing_timeout` / `routing_network` | 判斷服務逾時／連線錯誤 |
| `routing_auth` / `routing_rate_limit` | API 驗證失敗／限流 |
| `routing_invalid` / `routing_error` | 不符合判斷格式／其他服務錯誤 |
| `unexpected_error` | 未分類的執行錯誤，不保存原始錯誤文字 |

## 每日檢查與修復

本對話的每日排程讀取 `.local/diagnostics`，優先處理新版本仍在發生、頻率較高的問題。首次啟動或收集器停止時，先執行啟動 helper，給瀏覽器重送最多一分鐘。檢查點與每日處理摘要儲存在 `.local/diagnostic-review`，不清空原始證據。

修復需有可重現的證據與對應回歸測試，並執行 `npm test` / `npm run check`。不根據單一錯誤碼猜測修改，也不更改付款、選模政策或私人資料範圍。修復只留在本機，不 commit、不推送、不發布。新程式須重新載入擴充功能與刷新 ChatGPT 分頁才能生效。關機或 Codex 桌面 App 未運行時，本機每日任務不能執行。
