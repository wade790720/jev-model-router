(() => {
  "use strict";

  const messages = {
    en: {
      productName: "Smart ChatGPT", settings: "Settings", settingsAria: "Open Smart ChatGPT settings", probabilities: "Top JEV probabilities",
      analyzing: "Analyzing…", switching: "Switching…", switched: "Switched",
      switchedFallback: "Switched to fallback", lowConfidenceRecommendation: "Suggested: {model}; please confirm",
      switchedNoProbabilities: "Switched (no probabilities)", switchFailed: "Switch failed; choose manually", effortSwitchFailed: "Model switched; set effort manually",
      routeFailed: "Routing failed; choose a model manually", manual: "Keeping your manual selection",
      sendFailed: "Switch failed; adjust the model before sending", sendAgain: "Model switched; press Send again",
      unknownMode: "JEV returned an unknown mode", effortLow: "Low", effortMedium: "Medium", effortXhigh: "Extra high",
      optionsTitle: "Smart ChatGPT settings", popupSubtitle: "The right model, before you send", textOnly: "Text only", optionsIntro: "Routes ChatGPT text drafts. Images and attachments are not analyzed.",
      connectionMode: "Connection method", selectMode: "Choose one", personalMode: "My API key", personalModeHint: "Direct to TypeSafe",
      subscriptionMode: "US$5/month", subscriptionModeHint: "Hosted router service", personalNote: "The key stays in this browser's extension storage. Drafts go directly to TypeSafe.",
      serviceUrl: "Service URL", activationCode: "Subscription activation code", subscribe: "Subscribe", manage: "Manage or cancel subscription",
      subscriptionNote: "Drafts are forwarded to TypeSafe through the service. The service does not store draft text. Fair-use limits apply.",
      save: "Save settings", needServiceUrl: "Enter the service URL first", rootUrlOnly: "Use the service root URL without a path or query",
      httpsOnly: "The service URL must use HTTPS", needServiceAccess: "Allow the extension to connect to the service URL",
      needMode: "Choose a connection method", needTypeSafeKey: "Enter a TypeSafe API key", needSubscriptionDetails: "Enter the service URL and activation code",
      saved: "Saved. Return to ChatGPT and type a draft to begin.", checkoutFailed: "Could not open the subscription page",
      manageFailed: "Could not open subscription management", needActivationCode: "Enter your subscription activation code first"
    },
    "zh-Hant": {
      productName: "ChatGPT 智慧選模型", settings: "設定", settingsAria: "開啟 ChatGPT 智慧選模型設定", probabilities: "JEV 前三推薦機率",
      analyzing: "分析中…", switching: "正在切換…", switched: "已切換",
      switchedFallback: "已切換備用選項", lowConfidenceRecommendation: "建議 {model}，請確認",
      switchedNoProbabilities: "已切換（無機率）", switchFailed: "切換失敗，請手動調整", effortSwitchFailed: "模型已切換，強度請手動調整",
      routeFailed: "判斷失敗，請手動選擇模型", manual: "已保留手動選擇",
      sendFailed: "切換失敗，請調整模型後再送出", sendAgain: "已切換模型，請再按一次送出",
      unknownMode: "JEV 回傳未知模式", effortLow: "輕度", effortMedium: "中度", effortXhigh: "極高",
      optionsTitle: "ChatGPT 智慧選模型設定", popupSubtitle: "送出前，先選對模型", textOnly: "僅文字", optionsIntro: "分析 ChatGPT 文字草稿；不讀取圖片或附件。",
      connectionMode: "接入方式", selectMode: "請選擇", personalMode: "自備 API Key", personalModeHint: "直連 TypeSafe",
      subscriptionMode: "US$5／月", subscriptionModeHint: "使用託管路由服務", personalNote: "Key 只儲存在此瀏覽器的擴充功能資料中；草稿直接送到 TypeSafe。",
      serviceUrl: "服務網址", activationCode: "訂閱啟用碼", subscribe: "前往訂閱", manage: "管理／取消訂閱",
      subscriptionNote: "草稿會經過服務端轉送至 TypeSafe。服務端不儲存草稿內容；訂閱含合理使用限制。",
      save: "儲存設定", needServiceUrl: "請先輸入服務網址", rootUrlOnly: "請填入服務根網址，不含路徑或參數",
      httpsOnly: "服務網址必須使用 HTTPS", needServiceAccess: "需要允許擴充功能連線到服務網址",
      needMode: "請選擇接入方式", needTypeSafeKey: "請填入 TypeSafe API key", needSubscriptionDetails: "請填入服務網址與啟用碼",
      saved: "已儲存。回到 ChatGPT 輸入文字即可開始。", checkoutFailed: "無法開啟訂閱頁面",
      manageFailed: "無法開啟訂閱管理頁面", needActivationCode: "請先填入訂閱啟用碼"
    },
    "zh-Hans": {
      productName: "ChatGPT 智能选模型", settings: "设置", settingsAria: "打开 ChatGPT 智能选模型设置", probabilities: "JEV 前三推荐概率",
      analyzing: "分析中…", switching: "正在切换…", switched: "已切换",
      switchedFallback: "已切换备用选项", lowConfidenceRecommendation: "建议 {model}，请确认",
      switchedNoProbabilities: "已切换（无概率）", switchFailed: "切换失败，请手动调整", effortSwitchFailed: "模型已切换，请手动调整强度",
      routeFailed: "判断失败，请手动选择模型", manual: "已保留手动选择",
      sendFailed: "切换失败，请调整模型后再发送", sendAgain: "已切换模型，请再按一次发送",
      unknownMode: "JEV 返回未知模式", effortLow: "轻度", effortMedium: "中度", effortXhigh: "极高",
      optionsTitle: "ChatGPT 智能选模型设置", popupSubtitle: "发送前，先选对模型", textOnly: "仅文字", optionsIntro: "分析 ChatGPT 文字草稿；不读取图片或附件。",
      connectionMode: "接入方式", selectMode: "请选择", personalMode: "自备 API Key", personalModeHint: "直连 TypeSafe",
      subscriptionMode: "US$5／月", subscriptionModeHint: "使用托管路由服务", personalNote: "Key 仅保存在此浏览器的扩展数据中；草稿直接发送到 TypeSafe。",
      serviceUrl: "服务网址", activationCode: "订阅激活码", subscribe: "前往订阅", manage: "管理／取消订阅",
      subscriptionNote: "草稿会经服务端转发至 TypeSafe。服务端不保存草稿内容；订阅有合理使用限制。",
      save: "保存设置", needServiceUrl: "请先输入服务网址", rootUrlOnly: "请填写不含路径或参数的服务根网址",
      httpsOnly: "服务网址必须使用 HTTPS", needServiceAccess: "需要允许扩展连接到服务网址",
      needMode: "请选择接入方式", needTypeSafeKey: "请填写 TypeSafe API key", needSubscriptionDetails: "请填写服务网址和激活码",
      saved: "已保存。回到 ChatGPT 输入文字即可开始。", checkoutFailed: "无法打开订阅页面",
      manageFailed: "无法打开订阅管理页面", needActivationCode: "请先填写订阅激活码"
    },
    ja: {
      productName: "Smart ChatGPT", settings: "設定", settingsAria: "Smart ChatGPT の設定を開く", probabilities: "JEV の上位候補と確率",
      analyzing: "分析中…", switching: "切り替え中…", switched: "切り替え済み",
      switchedFallback: "代替候補に切り替え済み", lowConfidenceRecommendation: "候補: {model}。確認してください",
      switchedNoProbabilities: "切り替え済み（確率なし）", switchFailed: "切り替え失敗。手動で選択してください", effortSwitchFailed: "モデルは切り替え済み。強度は手動で設定してください",
      routeFailed: "判定できません。モデルを手動で選択してください", manual: "手動での選択を維持します",
      sendFailed: "切り替えに失敗しました。送信前にモデルを確認してください", sendAgain: "モデルを切り替えました。もう一度送信してください",
      unknownMode: "JEV から不明なモードが返されました", effortLow: "低", effortMedium: "中", effortXhigh: "最高",
      optionsTitle: "Smart ChatGPT の設定", popupSubtitle: "送信前に最適なモデルを", textOnly: "テキストのみ", optionsIntro: "ChatGPT のテキスト下書きを分析します。画像や添付は対象外です。",
      connectionMode: "接続方法", selectMode: "選択してください", personalMode: "自分の API キー", personalModeHint: "TypeSafe に直接接続",
      subscriptionMode: "月額 US$5", subscriptionModeHint: "ルーターサービスを利用", personalNote: "Key はこのブラウザーの拡張機能ストレージに保存されます。入力文は TypeSafe に直接送信されます。",
      serviceUrl: "サービス URL", activationCode: "契約アクティベーションコード", subscribe: "契約ページへ", manage: "契約の管理・解約",
      subscriptionNote: "入力文はサービスを経由して TypeSafe に送信されます。サービスは入力文を保存しません。公正利用制限があります。",
      save: "設定を保存", needServiceUrl: "サービス URL を入力してください", rootUrlOnly: "パスやクエリを含まないルート URL を入力してください",
      httpsOnly: "サービス URL は HTTPS が必要です", needServiceAccess: "サービス URL への接続を許可してください",
      needMode: "接続方法を選択してください", needTypeSafeKey: "TypeSafe API key を入力してください", needSubscriptionDetails: "サービス URL とコードを入力してください",
      saved: "保存しました。ChatGPT で入力を始めてください。", checkoutFailed: "契約ページを開けません",
      manageFailed: "契約管理ページを開けません", needActivationCode: "アクティベーションコードを入力してください"
    },
    ko: {
      productName: "Smart ChatGPT", settings: "설정", settingsAria: "Smart ChatGPT 설정 열기", probabilities: "JEV 상위 추천 확률",
      analyzing: "분석 중…", switching: "전환 중…", switched: "전환 완료",
      switchedFallback: "대체 옵션으로 전환됨", lowConfidenceRecommendation: "추천: {model}; 확인해 주세요",
      switchedNoProbabilities: "전환 완료 (확률 없음)", switchFailed: "전환 실패; 직접 선택하세요", effortSwitchFailed: "모델 전환 완료; 추론 강도는 직접 설정하세요",
      routeFailed: "판단 실패; 모델을 직접 선택하세요", manual: "수동 선택을 유지합니다",
      sendFailed: "전환 실패; 전송 전에 모델을 조정하세요", sendAgain: "모델 전환됨; 다시 전송하세요",
      unknownMode: "JEV가 알 수 없는 모드를 반환했습니다", effortLow: "낮음", effortMedium: "보통", effortXhigh: "매우 높음",
      optionsTitle: "Smart ChatGPT 설정", popupSubtitle: "전송 전에 알맞은 모델 선택", textOnly: "텍스트 전용", optionsIntro: "ChatGPT 텍스트 초안을 분석합니다. 이미지와 첨부는 제외됩니다.",
      connectionMode: "연결 방법", selectMode: "선택하세요", personalMode: "내 API 키", personalModeHint: "TypeSafe에 직접 연결",
      subscriptionMode: "월 US$5", subscriptionModeHint: "호스팅 라우터 사용", personalNote: "Key는 이 브라우저의 확장 프로그램 저장소에만 저장됩니다. 입력 내용은 TypeSafe로 직접 전송됩니다.",
      serviceUrl: "서비스 URL", activationCode: "구독 활성화 코드", subscribe: "구독하기", manage: "구독 관리 또는 취소",
      subscriptionNote: "입력 내용은 서비스를 통해 TypeSafe로 전달됩니다. 서비스는 입력 내용을 저장하지 않습니다. 공정 사용 제한이 적용됩니다.",
      save: "설정 저장", needServiceUrl: "서비스 URL을 입력하세요", rootUrlOnly: "경로나 쿼리가 없는 서비스 루트 URL을 입력하세요",
      httpsOnly: "서비스 URL은 HTTPS를 사용해야 합니다", needServiceAccess: "서비스 URL 연결을 허용하세요",
      needMode: "연결 방법을 선택하세요", needTypeSafeKey: "TypeSafe API key를 입력하세요", needSubscriptionDetails: "서비스 URL과 활성화 코드를 입력하세요",
      saved: "저장했습니다. ChatGPT에서 입력을 시작하세요.", checkoutFailed: "구독 페이지를 열 수 없습니다",
      manageFailed: "구독 관리 페이지를 열 수 없습니다", needActivationCode: "활성화 코드를 입력하세요"
    }
  };

  function normalizeLocale(value) {
    const locale = String(value ?? "").replace(/_/g, "-").toLowerCase();
    if (locale.startsWith("zh")) return /(?:-tw|-hk|-mo|-hant)(?:-|$)/.test(locale) ? "zh-Hant" : "zh-Hans";
    if (locale.startsWith("ja")) return "ja";
    if (locale.startsWith("ko")) return "ko";
    return "en";
  }

  const browserLocale = globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language || "en";
  const locale = normalizeLocale(browserLocale);
  function t(key, values = {}) {
    const template = messages[locale][key] ?? messages.en[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
  }

  globalThis.JevI18n = Object.freeze({ locale, t, normalizeLocale });
})();
