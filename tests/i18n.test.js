import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../extension/i18n.js", import.meta.url), "utf8");

function i18n(browserLanguage) {
  const context = { chrome: { i18n: { getUILanguage: () => browserLanguage } } };
  runInNewContext(source, context);
  return context.JevI18n;
}

test("uses browser UI language for Traditional and Simplified Chinese", () => {
  assert.equal(i18n("zh-TW").locale, "zh-Hant");
  assert.equal(i18n("zh-HK").t("switched", { model: "Instant" }), "已切換");
  assert.equal(i18n("zh-CN").locale, "zh-Hans");
  assert.equal(i18n("zh-CN").t("settings"), "设置");
});

test("localizes English, Japanese, Korean and falls back to English", () => {
  assert.equal(i18n("en-US").t("switched", { model: "Instant" }), "Switched");
  assert.equal(i18n("ja-JP").t("settings"), "設定");
  assert.equal(i18n("ko-KR").t("settings"), "설정");
  assert.equal(i18n("fr-FR").locale, "en");
});

test("product branding follows the browser language in the popup and manifest", () => {
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.name, "__MSG_productName__");
  assert.equal(manifest.description, "__MSG_productDescription__");
  assert.equal(manifest.action.default_title, "__MSG_productName__");
  assert.equal(manifest.default_locale, "en");
  for (const [language, folder, expected] of [
    ["en-US", "en", "Smart ChatGPT"],
    ["zh-TW", "zh_TW", "ChatGPT 智慧選模型"],
    ["zh-CN", "zh_CN", "ChatGPT 智能选模型"],
    ["ja-JP", "ja", "Smart ChatGPT"],
    ["ko-KR", "ko", "Smart ChatGPT"]
  ]) {
    const messages = JSON.parse(readFileSync(new URL(`../extension/_locales/${folder}/messages.json`, import.meta.url), "utf8"));
    assert.equal(i18n(language).t("productName"), expected);
    assert.equal(messages.productName.message, expected);
    assert.ok(messages.productDescription.message.length > 0);
    assert.ok(messages.productDescription.message.length <= 132);
  }
  const traditional = JSON.parse(readFileSync(new URL("../extension/_locales/zh_TW/messages.json", import.meta.url), "utf8"));
  const simplified = JSON.parse(readFileSync(new URL("../extension/_locales/zh_CN/messages.json", import.meta.url), "utf8"));
  assert.equal(traditional.productDescription.message, "根據輸入內容推薦適合的 ChatGPT 模型，由 TypeSafe AI Jev 提供判斷；僅提供提示，模型由你自行切換。");
  assert.equal(simplified.productDescription.message, "根据输入内容推荐适合的 ChatGPT 模型，由 TypeSafe AI Jev 提供判断；仅提供提示，模型由你自行切换。");
});
