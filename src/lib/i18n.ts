// UI text is bundled instead of read from chrome.i18n: after an extension reload the
// orphaned content script can lose chrome.*, yet must still say "refresh this page".
// public/_locales only holds the manifest's name and description.
const en = {
  routeConsent: "Allow draft analysis in Settings",
  routeKeyMissing: "Add your TypeSafe API key in Settings",
  routeServiceNotReady: "Hosted service is not ready; use your own API key",
  routeMembershipMissing: "Set up member access in Settings",
  routeAuth: "Access rejected; check your key or membership",
  routeRateLimit: "Too many requests; try again later",
  routeTimeout: "Analysis timed out; try again",
  routeNetwork: "Cannot reach the service; check your connection",
  routeInvalid: "Invalid analysis response; try again later",
  extensionReloaded: "Extension reloaded. Refresh this ChatGPT page.",
  settingsUnavailable: "Could not open settings. Use the extension toolbar button.",
  recommendation: "Suggested: {model}",
  advancedSettings: "Advanced settings",
  usePersonalKey: "Use my TypeSafe API key (no service subscription)",
  routingConsent: "Allow draft analysis",
  consentNote: "After a typing pause, draft text goes to TypeSafe directly or through the hosted service. No automatic switching; no images or attachments.",
  diagnosticsEnabled: "Collect recommendation diagnostics",
  exportDiagnostics: "Export diagnostics",
  productName: "Smart ChatGPT", settings: "Settings", settingsAria: "Open Smart ChatGPT settings", probabilities: "Top JEV probabilities",
  analyzing: "Analyzing…", switching: "Switching…", switched: "Switched",
  lowConfidenceRecommendation: "Suggested: {model}; please confirm",
  routeFailed: "Routing failed; choose a model manually", manual: "Keeping your manual selection",
  unknownMode: "JEV returned an unknown mode", effortLow: "Low", effortMedium: "Medium", effortXhigh: "Extra high",
  optionsTitle: "Smart ChatGPT settings", popupSubtitle: "The right model, before you send", textOnly: "Text only", optionsIntro: "Routes ChatGPT text drafts. Images and attachments are not analyzed.",
  connectionMode: "Connection method", selectMode: "Choose one", 
  personalNote: "Leave it empty to use the hosted service. The key stays in this browser's extension storage. Drafts go directly to TypeSafe.",
  activationCode: "Subscription activation code", 
  save: "Save settings", 
  needTypeSafeKey: "Enter a TypeSafe API key", 
  saved: "Saved. Return to ChatGPT and type a draft to begin."
};

export type MessageKey = keyof typeof en;
export type Locale = "en" | "zh-Hant" | "zh-Hans" | "ja" | "ko";

const messages: Record<Locale, Partial<Record<MessageKey, string>>> = {
  en,
  "zh-Hant": {
    routeConsent: "請到設定同意文字草稿分析",
    routeKeyMissing: "請到設定填入 TypeSafe API Key",
    routeServiceNotReady: "託管服務尚未開通，可先自備 Key",
    routeMembershipMissing: "尚未設定會員憑證，請開啟設定",
    routeAuth: "驗證失敗，請檢查 Key 或會員資格",
    routeRateLimit: "請求過於頻繁，請稍後再試",
    routeTimeout: "判斷逾時，請稍後再試",
    routeNetwork: "無法連線，請檢查網路後重試",
    routeInvalid: "判斷回應格式異常，請稍後再試",
    extensionReloaded: "套件已重新載入，請重新整理此 ChatGPT 分頁。",
    settingsUnavailable: "無法開啟設定，請使用工具列的套件圖示。",
    recommendation: "建議使用 {model}",
    advancedSettings: "進階設定",
    usePersonalKey: "使用自己的 TypeSafe API Key（免服務訂閱）",
    routingConsent: "同意分析文字草稿",
    consentNote: "輸入停頓後，文字會直接或經託管服務送至 TypeSafe。不自動切換模型、不分析圖片或附件。",
    diagnosticsEnabled: "收集模型推薦診斷",
    exportDiagnostics: "匯出診斷記錄",
    productName: "ChatGPT 智慧選模型", settings: "設定", settingsAria: "開啟 ChatGPT 智慧選模型設定", probabilities: "JEV 前三推薦機率",
    analyzing: "分析中…", switching: "正在切換…", switched: "已切換",
    lowConfidenceRecommendation: "建議 {model}，請確認",
    routeFailed: "判斷失敗，請手動選擇模型", manual: "已保留手動選擇",
    unknownMode: "JEV 回傳未知模式", effortLow: "輕度", effortMedium: "中度", effortXhigh: "極高",
    optionsTitle: "ChatGPT 智慧選模型設定", popupSubtitle: "送出前，先選對模型", textOnly: "僅文字", optionsIntro: "分析 ChatGPT 文字草稿；不讀取圖片或附件。",
    connectionMode: "接入方式", selectMode: "請選擇", 
    personalNote: "留空就使用託管服務。Key 只儲存在此瀏覽器的擴充功能資料中；草稿直接送到 TypeSafe。",
    activationCode: "訂閱啟用碼", 
    save: "儲存設定", 
    needTypeSafeKey: "請填入 TypeSafe API key", 
    saved: "已儲存。回到 ChatGPT 輸入文字即可開始。"
  },
  "zh-Hans": {
    routeConsent: "请到设置同意文字草稿分析",
    routeKeyMissing: "请到设置填写 TypeSafe API Key",
    routeServiceNotReady: "托管服务尚未开通，可先自备 Key",
    routeMembershipMissing: "尚未设置会员凭证，请打开设置",
    routeAuth: "验证失败，请检查 Key 或会员资格",
    routeRateLimit: "请求过于频繁，请稍后重试",
    routeTimeout: "判断超时，请稍后重试",
    routeNetwork: "无法连接，请检查网络后重试",
    routeInvalid: "判断响应格式异常，请稍后重试",
    extensionReloaded: "扩展已重新加载，请刷新此 ChatGPT 标签页。",
    settingsUnavailable: "无法打开设置，请使用工具栏的扩展图标。",
    recommendation: "建议使用 {model}",
    advancedSettings: "高级设置",
    usePersonalKey: "使用自己的 TypeSafe API Key（免服务订阅）",
    routingConsent: "同意分析文字草稿",
    consentNote: "输入停顿后，文字会直接或经托管服务发送至 TypeSafe。不自动切换模型，不分析图片或附件。",
    diagnosticsEnabled: "收集模型推荐诊断",
    exportDiagnostics: "导出诊断记录",
    productName: "ChatGPT 智能选模型", settings: "设置", settingsAria: "打开 ChatGPT 智能选模型设置", probabilities: "JEV 前三推荐概率",
    analyzing: "分析中…", switching: "正在切换…", switched: "已切换",
    lowConfidenceRecommendation: "建议 {model}，请确认",
    routeFailed: "判断失败，请手动选择模型", manual: "已保留手动选择",
    unknownMode: "JEV 返回未知模式", effortLow: "轻度", effortMedium: "中度", effortXhigh: "极高",
    optionsTitle: "ChatGPT 智能选模型设置", popupSubtitle: "发送前，先选对模型", textOnly: "仅文字", optionsIntro: "分析 ChatGPT 文字草稿；不读取图片或附件。",
    connectionMode: "接入方式", selectMode: "请选择", 
    personalNote: "留空则使用托管服务。Key 仅保存在此浏览器的扩展数据中；草稿直接发送到 TypeSafe。",
    activationCode: "订阅激活码", 
    save: "保存设置", 
    needTypeSafeKey: "请填写 TypeSafe API key", 
    saved: "已保存。回到 ChatGPT 输入文字即可开始。"
  },
  ja: {
    routeConsent: "設定で下書き分析を許可してください",
    routeKeyMissing: "設定で TypeSafe API キーを入力してください",
    routeServiceNotReady: "サービスは未開通です。自分の API キーを使えます",
    routeMembershipMissing: "設定で会員認証を設定してください",
    routeAuth: "認証失敗。キーまたは会員資格を確認してください",
    routeRateLimit: "リクエストが多すぎます。後で再試行してください",
    routeTimeout: "分析がタイムアウトしました。再試行してください",
    routeNetwork: "接続できません。ネットワークを確認してください",
    routeInvalid: "応答形式が不正です。後で再試行してください",
    extensionReloaded: "拡張機能を再読み込みしました。この ChatGPT タブを更新してください。",
    settingsUnavailable: "設定を開けません。ツールバーの拡張機能アイコンを使ってください。",
    recommendation: "候補: {model}",
    advancedSettings: "詳細設定",
    usePersonalKey: "自分の TypeSafe API キーを使う（サービス契約不要）",
    routingConsent: "下書きの分析を許可する",
    consentNote: "入力が止まるとテキストを TypeSafe に直接またはサービス経由で送信します。自動切替や画像・添付の分析はしません。",
    diagnosticsEnabled: "モデル推薦の診断を収集",
    exportDiagnostics: "診断をエクスポート",
    productName: "Smart ChatGPT", settings: "設定", settingsAria: "Smart ChatGPT の設定を開く", probabilities: "JEV の上位候補と確率",
    analyzing: "分析中…", switching: "切り替え中…", switched: "切り替え済み",
    lowConfidenceRecommendation: "候補: {model}。確認してください",
    routeFailed: "判定できません。モデルを手動で選択してください", manual: "手動での選択を維持します",
    unknownMode: "JEV から不明なモードが返されました", effortLow: "低", effortMedium: "中", effortXhigh: "最高",
    optionsTitle: "Smart ChatGPT の設定", popupSubtitle: "送信前に最適なモデルを", textOnly: "テキストのみ", optionsIntro: "ChatGPT のテキスト下書きを分析します。画像や添付は対象外です。",
    connectionMode: "接続方法", selectMode: "選択してください", 
    personalNote: "空欄のままならホスト型サービスを使います。Key はこのブラウザーの拡張機能ストレージに保存されます。入力文は TypeSafe に直接送信されます。",
    activationCode: "契約アクティベーションコード", 
    save: "設定を保存", 
    needTypeSafeKey: "TypeSafe API key を入力してください", 
    saved: "保存しました。ChatGPT で入力を始めてください。"
  },
  ko: {
    routeConsent: "설정에서 초안 분석을 허용하세요",
    routeKeyMissing: "설정에서 TypeSafe API 키를 입력하세요",
    routeServiceNotReady: "서비스가 준비되지 않았습니다. 개인 키를 사용할 수 있습니다",
    routeMembershipMissing: "설정에서 회원 인증을 설정하세요",
    routeAuth: "인증 실패. 키 또는 회원 자격을 확인하세요",
    routeRateLimit: "요청이 너무 많습니다. 나중에 다시 시도하세요",
    routeTimeout: "분석 시간이 초과되었습니다. 다시 시도하세요",
    routeNetwork: "연결할 수 없습니다. 네트워크를 확인하세요",
    routeInvalid: "응답 형식 오류입니다. 나중에 다시 시도하세요",
    extensionReloaded: "확장 프로그램이 다시 로드되었습니다. 이 ChatGPT 탭을 새로고침하세요.",
    settingsUnavailable: "설정을 열 수 없습니다. 도구 모음의 확장 프로그램 아이콘을 사용하세요.",
    recommendation: "추천: {model}",
    advancedSettings: "고급 설정",
    usePersonalKey: "내 TypeSafe API 키 사용 (서비스 구독 불필요)",
    routingConsent: "초안 분석 허용",
    consentNote: "입력이 멈추면 텍스트를 TypeSafe에 직접 또는 서비스 경유로 전송합니다. 자동 전환 및 이미지·첨부 분석은 하지 않습니다.",
    diagnosticsEnabled: "모델 추천 진단 수집",
    exportDiagnostics: "진단 내보내기",
    productName: "Smart ChatGPT", settings: "설정", settingsAria: "Smart ChatGPT 설정 열기", probabilities: "JEV 상위 추천 확률",
    analyzing: "분석 중…", switching: "전환 중…", switched: "전환 완료",
    lowConfidenceRecommendation: "추천: {model}; 확인해 주세요",
    routeFailed: "판단 실패; 모델을 직접 선택하세요", manual: "수동 선택을 유지합니다",
    unknownMode: "JEV가 알 수 없는 모드를 반환했습니다", effortLow: "낮음", effortMedium: "보통", effortXhigh: "매우 높음",
    optionsTitle: "Smart ChatGPT 설정", popupSubtitle: "전송 전에 알맞은 모델 선택", textOnly: "텍스트 전용", optionsIntro: "ChatGPT 텍스트 초안을 분석합니다. 이미지와 첨부는 제외됩니다.",
    connectionMode: "연결 방법", selectMode: "선택하세요", 
    personalNote: "비워 두면 호스팅 서비스를 사용합니다. Key는 이 브라우저의 확장 프로그램 저장소에만 저장됩니다. 입력 내용은 TypeSafe로 직접 전송됩니다.",
    activationCode: "구독 활성화 코드", 
    save: "설정 저장", 
    needTypeSafeKey: "TypeSafe API key를 입력하세요", 
    saved: "저장했습니다. ChatGPT에서 입력을 시작하세요."
  }
};

export function normalizeLocale(value: unknown): Locale {
  const locale = String(value ?? "").replace(/_/g, "-").toLowerCase();
  if (locale.startsWith("zh")) return /(?:-tw|-hk|-mo|-hant)(?:-|$)/.test(locale) ? "zh-Hant" : "zh-Hans";
  if (locale.startsWith("ja")) return "ja";
  if (locale.startsWith("ko")) return "ko";
  return "en";
}

// Read on every call (cheap), so tests can switch languages; falls back when chrome.* is gone.
export function locale(): Locale {
  let language: string | undefined;
  try { language = globalThis.chrome?.i18n?.getUILanguage?.(); } catch { /* orphaned content script */ }
  return normalizeLocale(language || globalThis.navigator?.language || "en");
}

export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  const template = messages[locale()][key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}
