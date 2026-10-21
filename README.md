# Model Picker for ChatGPT（ChatGPT 模型選擇器）

> Repo 名稱是 `jev-model-router`；Chrome Web Store 上的名稱是 **Model Picker for ChatGPT**。

![version](https://img.shields.io/badge/version-0.5.0-blue)
![status](https://img.shields.io/badge/status-internal%20testing-orange)
![node](https://img.shields.io/badge/node-%3E%3D22.18-339933)
![stack](https://img.shields.io/badge/React%20%2B%20TypeScript%20%2B%20Vite-646CFF)
![chrome](https://img.shields.io/badge/Chrome%20%2F%20Edge-Manifest%20V3-4285F4)

這是一個 Chrome/Edge 擴充功能，它讀取 ChatGPT 輸入框的草稿。
由 TypeSafe AI Jev 推薦模型與推理強度，只顯示建議，模型由使用者自己切換。
工具免費，用你自己的 TypeSafe API 金鑰。TypeSafe 依用量計費，要先在 TypeSafe 綁定付款方式（價格表在 [typesafe.ai](https://typesafe.ai/)）。沒有託管服務，不需要登入或會員。

## 目錄

- [背景](#背景)
- [安裝](#安裝)
- [使用方式](#使用方式)
- [架構](#架構)
- [專案結構](#專案結構)
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
| Node.js | 22.18 以上（診斷收集器直接執行 TypeScript；Skool 測試使用內建 SQLite） |
| npm | 隨 Node.js 安裝 |
| Wrangler | 只有部署 Worker 時需要，用 `npx wrangler@latest` 執行 |

技術：React 19、TypeScript、Vite、Tailwind CSS 4、shadcn/ui、vitest。不載入外部字型或 CDN。

### 建置並安裝擴充功能

1. 下載本專案，執行 `npm ci` 和 `npm run build`。輸出在 `dist/`。
2. 在瀏覽器開啟 `chrome://extensions`（Edge 為 `edge://extensions`）。
3. 開啟右上角的「開發人員模式」。
4. 按「載入未封裝項目」，選擇 `dist/` 資料夾。

改程式後，再執行一次 `npm run build`，然後在擴充功能頁按「重新載入」。

### 開發設定頁

```sh
npm run dev   # 用假資料開啟 http://localhost:5173/options.html，不需載入擴充功能
```

## 使用方式
安裝後會自動打開設定頁，照三個步驟做：

1. 先在 TypeSafe 主控台綁定付款方式，再到 [TypeSafe 主控台的金鑰頁面](https://console.typesafe.ai/keys) 申請 API 金鑰。沒有可用額度時，金鑰不能用。
2. 把金鑰貼到設定頁，按「驗證並儲存」。擴充功能會先向 TypeSafe 確認金鑰可用（列出可用模型，不花額度），才會儲存。
3. 到 ChatGPT 試一次。第一次出現建議後，引導完成，設定頁只剩一般設定。

金鑰只存在瀏覽器裡，只會送到 TypeSafe。沒有金鑰時，ChatGPT 頁面上的徽章會提示你先設定。

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
npm test         # 執行全部單元測試（vitest）
npm run check    # TypeScript 型別檢查（擴充功能與 Worker）
```

測試不使用真實金鑰或 ChatGPT 對話。

## 架構

```text
ChatGPT 輸入框 → content.js（debounce、IME 保護）→ background.js
  → 用使用者自己的金鑰直接呼叫 TypeSafe Jev
→ 回傳 choice、confidence、前三名機率 → 只顯示建議
```

權限只有 `storage`、`https://chatgpt.com/*`、`https://api.typesafe.ai/*`。錯誤報告送到 router.tekuei.com 是不需要權限的簡單請求（`src/lib/error-log.ts`）。

Jev 從固定選項中選一個：

| ChatGPT 模式 | 選項 |
| --- | --- |
| 對話 | `instant`、`medium`、`high`、`pro` |
| 工作 | `luna`、`sol_low`、`sol_medium`、`astra_low`、`astra_medium`、`astra_xhigh` |

ChatGPT 新增模型時，必須手動更新 `src/lib/route.ts`，程式不會自動新增選項。

## 專案結構

測試檔（`*.test.ts`）放在受測程式旁邊。

```text
options.html, popup.html   設定頁和工具列彈出視窗（Vite 入口）
src/
  App.tsx, main.tsx        設定頁 UI（React + shadcn/ui）
  background.ts            Service worker：呼叫 TypeSafe、安裝時打開設定頁
  content/router.ts        偵測輸入框與模式，排除過期回應，顯示推薦
  lib/route.ts             模型選項、判斷標準、回應驗證
  lib/settings.ts          金鑰驗證與儲存、引導進度
  lib/i18n.ts              介面文字（en、zh-Hant、zh-Hans、ja、ko）
  components/ui/           shadcn/ui 元件
public/                    manifest.json、_locales、content.css（原樣複製到 dist/）
worker/                    伺服器：只負責錯誤收件箱（router.tekuei.com）
  src/skool.ts             入口：health、錯誤收件、管理者讀取與確認
  src/errors.ts            錯誤收件箱
  migrations/              D1 資料表（舊會員表保留未動）
scripts/                   content script 打包、診斷收集器、內部測試工具
docs/                      部署、隱私、診斷與歷史文件
```

## 貢獻

有問題請直接聯絡維護者。

提交變更前：

1. 執行 `npm test` 與 `npm run check`，兩者都必須通過。
2. 改路由規則時，同時更新 `src/lib/route.ts` 和對應測試。
3. 不要把 Key、token 或 Secret 寫進 Git、文件或擴充功能程式。
4. UI 或 DOM 相關變更，要在真實 Chrome／Edge 帳號上驗證對話、工作模式、IME 與明暗主題。

## 授權

設定頁配色來自 Radix Colors，授權見 [RADIX-LICENSE.txt](public/RADIX-LICENSE.txt)。
