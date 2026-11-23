import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRESETS,
  THEME_VARS,
  canonicalTheme,
  contrastRatio,
  customTheme,
  mix,
  themeFrameStyle,
  themeProblem,
  themeVars,
} from "./page-theme.ts";

describe("conference colour theme", () => {
  it("gives every preset eleven readable colours", () => {
    assert.equal(PRESETS.length, 6);
    for (const preset of PRESETS) {
      assert.equal(preset.colours.length, THEME_VARS.length);
      assert.equal(themeProblem(preset.key), null);
      const vars = themeVars(preset.key);
      assert.ok(vars);
      THEME_VARS.forEach((name, index) => {
        assert.equal(vars[name], preset.colours[index], `${preset.key} ${name}`);
      });
    }
  });

  it("leaves parchment with no variables", () => {
    assert.equal(themeProblem(null), null);
    assert.equal(themeProblem(""), null);
    assert.equal(themeProblem("   "), null);
    assert.equal(themeVars(null), null);
    assert.equal(themeVars(""), null);
    assert.equal(themeFrameStyle(null), null);
    assert.equal(canonicalTheme(null), null);
    assert.equal(canonicalTheme("Parchment (current)"), null);
  });

  it("refuses low-contrast text and names the ratio", () => {
    const value = "custom:#ffffff,#888888,#000000";
    const ratio = contrastRatio("#888888", "#ffffff").toFixed(1);
    assert.ok(Number(ratio) < 4.5);
    assert.equal(themeProblem(value), `Text on the background is hard to read (contrast ${ratio}; needs 4.5).`);
    assert.equal(themeVars(value)?.["--color-ink"], "#888888");
  });

  it("refuses orange as an accent because it fails on the background", () => {
    const ratio = contrastRatio("#f47321", "#ffffff").toFixed(1);
    assert.equal(ratio, "2.9");
    assert.equal(
      themeProblem("custom:#ffffff,#0f1f17,#f47321"),
      `The accent on the background is hard to read (contrast ${ratio}; needs 4.5).`,
    );
  });

  it("accepts the orange-green custom colours", () => {
    const value = "custom:#f6f8f5,#0f1f17,#005030,#f47321";
    assert.equal(themeProblem(value), null);
    const vars = themeVars(value);
    assert.equal(vars?.["--color-paper"], "#f6f8f5");
    assert.equal(vars?.["--color-ink"], "#0f1f17");
    assert.equal(vars?.["--color-bronze"], "#005030");
    assert.equal(vars?.["--color-highlight"], "#f47321");
    assert.equal(vars?.["--color-muted"], mix("#0f1f17", "#f6f8f5", 0.3));
  });

  it("accepts dark grey text on white with a dark accent", () => {
    assert.equal(themeProblem("custom:#ffffff,#333333,#005030"), null);
  });

  it("accepts a custom theme whose derived text clears 4.5", () => {
    const value = "custom:#f6f8f5,#000000,#005030,#f47321";
    assert.equal(themeProblem(value), null);
    assert.equal(canonicalTheme(value), value);
    const frame = themeFrameStyle(value);
    assert.equal(frame?.backgroundColor, "var(--color-paper)");
    assert.equal(frame?.minHeight, "100dvh");
    assert.equal(frame?.["--color-highlight"], "#f47321");
  });

  it("parses three colours and four colours", () => {
    const three = themeVars("custom:#ffffff,#000000,#005030");
    assert.equal(three?.["--color-paper"], "#ffffff");
    assert.equal(three?.["--color-ink"], "#000000");
    assert.equal(three?.["--color-bronze"], "#005030");
    assert.equal(three?.["--color-highlight"], "#005030");
    assert.equal(themeProblem("custom:#ffffff,#000000,#005030"), null);

    const four = themeVars("custom:#F6F8F5,#000000,#005030,#F47321");
    assert.equal(four?.["--color-paper"], "#f6f8f5");
    assert.equal(four?.["--color-highlight"], "#f47321");
    assert.equal(canonicalTheme("custom:#F6F8F5,#000000,#005030,#F47321"), "custom:#f6f8f5,#000000,#005030,#f47321");
  });

  it("does not check the highlight colour as text", () => {
    const value = "custom:#f6f8f5,#000000,#005030,#ffff00";
    assert.ok(contrastRatio("#ffff00", "#f6f8f5") < 4.5);
    assert.equal(themeProblem(value), null);
    assert.equal(themeVars(value)?.["--color-highlight-fg"], "#000000");
  });

  it("mixes each sRGB channel and picks the stronger foreground", () => {
    assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
    assert.equal(mix("#ff0000", "#0000ff", 0.5), "#800080");
    assert.equal(contrastRatio("#000000", "#ffffff"), 21);
    const onOrange = customTheme("#ffffff", "#0f1f17", "#f47321");
    assert.equal(onOrange["--color-bronze-fg"], "#0f1f17");
    assert.equal(onOrange["--color-highlight"], "#f47321");
    const onGreen = customTheme("#ffffff", "#0f1f17", "#005030");
    assert.equal(onGreen["--color-bronze-fg"], "#ffffff");
    assert.equal(onGreen["--color-surface"], mix("#ffffff", "#ffffff", 0.5));
  });

  it("names unknown keys and malformed custom values", () => {
    assert.equal(themeProblem("navy"), "That theme is not one of the presets.");
    assert.equal(themeVars("navy"), null);
    assert.equal(themeProblem("custom:#fff,#000000,#000000"), "The custom colours must be three or four #rrggbb values.");
    assert.equal(themeProblem("custom:#ffffff,#000000"), "The custom colours must be three or four #rrggbb values.");
    assert.equal(themeVars("custom:nope"), null);
  });
});
