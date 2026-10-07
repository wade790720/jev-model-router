# Smart ChatGPT（ChatGPT 智慧選模型）

![version](https://img.shields.io/badge/version-0.3.2-blue)
![status](https://img.shields.io/badge/status-internal%20testing-orange)
![node](https://img.shields.io/badge/node-%3E%3D22.13-339933)
![chrome](https://img.shields.io/badge/Chrome%20%2F%20Edge-Manifest%20V3-4285F4)

這是一個 Chrome/Edge 擴充功能，它讀取 ChatGPT 輸入框的草稿。
由 TypeSafe AI Jev 推薦模型與推理強度，只顯示建議，模型由使用者自己切換。

## 目錄

- [背景](#背景)
- [安裝](#安裝)
- [使用方式](#使用方式)
- [架構](#架構)
- [專案結構](#專案結構)
- [部署進度](#部署進度)
- [貢獻](#貢獻)
- [授權](#授權)

## 背景

ChatGPT 有很多模型和推理強度，簡單的問題用強模型會浪費時間；
困難的問題用弱模型會出錯，本專案讓 Jev 先讀草稿，再推薦足以可靠完成任務的最輕選項。

## 安裝
| 項目 | 版本或說明 |
| --- | --- |
| 作業系統 | Windows、macOS、Linux 皆可 |
| 瀏覽器 | Chrome 或 Edge 桌面版（不支援原生桌面 App） |
| Node.js | 22.13 以上 |
| npm | 隨 Node.js 安裝 |
| Wrangler | 只有部署 Worker 時需要，用 `npx wrangler@latest` 執行 |

擴充功能不需要建置，也不載入外部字型或 CDN。

### 安裝擴充功能

1. 下載本專案。
2. 在瀏覽器開啟 `chrome://extensions`（Edge 為 `edge://extensions`）。
3. 開啟右上角的「開發人員模式」。
4. 按「載入未封裝項目」，選擇 `extension/` 資料夾。

### 安裝開發依賴

```sh
npm ci
```

## 使用方式
開啟擴充功能的設定頁，選一種接入方式：

| 接入方式 | 誰持有 TypeSafe Key | 適用情況 |
| --- | --- | --- |
| 託管模式（預設） | Cloudflare Worker | 有會員憑證的使用者，正式會員登入尚未開通，目前只能用管理者核發的內部測試憑證。 |
| 自備 Key 模式 | 你的瀏覽器 | 你有自己的 TypeSafe API Key，開啟「進階設定」，勾選「使用自己的 TypeSafe API Key」。 |

儲存設定後即可使用。

### 在 ChatGPT 使用

1. 重新整理 ChatGPT 分頁。
2. 在輸入框打字，停頓約 950 ms 後，草稿會送到 TypeSafe 分析。
3. 輸入框旁會顯示「建議使用」和最多三個候選的機率。
4. 依建議自行切換模型，再送出，送出不會等待推薦。

燈號意義：

- 綠燈：推薦已完成。這不代表模型已切換，也不保證答案正確。
- 黃燈：Jev 的信心低於 0.45，建議僅供參考。
- 紅燈：推薦失敗，ChatGPT 仍可正常送出。

### 測試與檢查

```sh
npm test         # 執行全部單元測試
npm run check    # 檢查語法與配色檔是否同步
```

測試不使用真實 Key、會員資料或 ChatGPT 對話。

### 本機診斷（選用）

```sh
npm run diagnostics:collect   # 啟動本機收集器（127.0.0.1:43127）
npm run diagnostics:summary   # 查看近 14 天統計
```

診斷不上傳草稿、Key 或完整 DOM，細節見 [本機診斷](docs/DIAGNOSTICS.md)。

## 架構

```text
ChatGPT 輸入框 → content.js（debounce、IME 保護）→ background.js
  ├ 託管模式 → Cloudflare Worker → 會員與 session 檢查 → 用量限制 → Jev
  └ 自備 Key 模式 → Jev
→ 回傳 choice、confidence、前三名機率 → 只顯示建議
```

Jev 從固定選項中選一個：

| ChatGPT 模式 | 選項 |
| --- | --- |
| 對話 | `instant`、`medium`、`high`、`pro` |
| 工作 | `luna`、`sol_low`、`sol_medium`、`astra_low`、`astra_medium`、`astra_xhigh` |

ChatGPT 新增模型時，必須手動更新 `extension/route.js`，程式不會自動新增選項。

## 專案結構

```text
extension/
  content.js         偵測輸入框與模式，排除過期回應，顯示推薦
  route.js           模型選項、判斷標準、回應驗證（擴充功能與 Worker 共用）
  background.js      選擇接入方式，處理逾時
  service-config.js  公開服務網址與 Skool 網址（不含私鑰）
  options.*          設定頁
  diagnostics.js     本機推薦診斷
  _locales/          en、zh_TW、zh_CN、ja、ko
worker/
  src/skool.js       目前的部署入口：健康檢查、推薦、管理者會員管理
  src/index.js       共用路由與用量限制（舊 Stripe 程式保留，不對外開放）
  migrations/        D1 資料表變更
scripts/             診斷收集器、配色同步、內部測試工具
tests/               node:test 單元測試
docs/                部署、隱私、診斷與歷史文件
```

## 貢獻

有問題請直接聯絡維護者。

提交變更前：

1. 執行 `npm test` 與 `npm run check`，兩者都必須通過。
2. 改路由規則時，同時更新 `extension/route.js` 和對應測試。
3. 不要把 Key、token 或 Secret 寫進 Git、文件或擴充功能程式。
4. UI 或 DOM 相關變更，要在真實 Chrome／Edge 帳號上驗證對話、工作模式、IME 與明暗主題。

## 授權

`extension/vendor/radix-colors.css` 來自 Radix Colors，授權見 [RADIX-LICENSE.txt](extension/vendor/RADIX-LICENSE.txt)。
