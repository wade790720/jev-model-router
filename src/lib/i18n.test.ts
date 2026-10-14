import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { locale, t } from "./i18n";

const json = (path: string) => JSON.parse(readFileSync(new URL(`../../public/${path}`, import.meta.url), "utf8"));
const as = (language: string) => vi.stubGlobal("chrome", { i18n: { getUILanguage: () => language } });
afterEach(() => vi.unstubAllGlobals());

test("uses browser UI language for Traditional and Simplified Chinese", () => {
  as("zh-TW"); expect(locale()).toBe("zh-Hant");
  as("zh-HK"); expect(t("switched", { model: "Instant" })).toBe("已切換");
  as("zh-CN"); expect(locale()).toBe("zh-Hans");
  expect(t("analyzing")).toBe("分析中…");
});

test("localizes English, Japanese, Korean and falls back to English", () => {
  as("en-US"); expect(t("switched", { model: "Instant" })).toBe("Switched");
  as("ja-JP"); expect(t("recommendation", { model: "High" })).toBe("候補: High");
  as("ko-KR"); expect(t("analyzing")).toBe("분석 중…");
  as("fr-FR"); expect(locale()).toBe("en");
});

test("product branding follows the browser language in the popup and manifest", () => {
  const manifest = json("manifest.json");
  expect(manifest.name).toBe("__MSG_productName__");
  expect(manifest.description).toBe("__MSG_productDescription__");
  expect(manifest.action.default_title).toBe("__MSG_productName__");
  expect(manifest.default_locale).toBe("en");
  for (const [language, folder, expected] of [
    ["en-US", "en", "Model Picker for ChatGPT"],
    ["zh-TW", "zh_TW", "ChatGPT 模型選擇器"],
    ["zh-CN", "zh_CN", "ChatGPT 模型选择器"],
    ["ja-JP", "ja", "ChatGPT モデル選択"],
    ["ko-KR", "ko", "ChatGPT 모델 선택기"]
  ]) {
    const messages = json(`_locales/${folder}/messages.json`);
    as(language);
    expect(t("productName")).toBe(expected);
    expect(messages.productName.message).toBe(expected);
    expect(messages.productDescription.message.length).toBeGreaterThan(0);
    expect(messages.productDescription.message.length).toBeLessThanOrEqual(132);
  }
  expect(json("_locales/zh_TW/messages.json").productDescription.message).toBe("根據輸入內容推薦適合的 ChatGPT 模型，由 TypeSafe AI Jev 提供判斷；僅提供提示，模型由你自行切換，提供給百寶袋俱樂部會員專用。");
  expect(json("_locales/zh_CN/messages.json").productDescription.message).toBe("根据输入内容推荐适合的 ChatGPT 模型，由 TypeSafe AI Jev 提供判断；仅提供提示，模型由您自行切换，专供百宝袋俱乐部会员使用。");
  // Exactly 132 characters, the store's limit for the short description.
  expect(json("_locales/en/messages.json").productDescription.message).toBe("Suggests the best ChatGPT model for your text via TypeSafe AI Jev. Guidance only; you switch models. For Wonder Pocket Club members.");
});

test("an orphaned content script without chrome.* still gets text", () => {
  vi.stubGlobal("chrome", { i18n: { getUILanguage: () => { throw new Error("Extension context invalidated."); } } });
  expect(() => t("extensionReloaded")).not.toThrow();
});
