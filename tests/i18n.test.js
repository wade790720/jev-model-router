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
