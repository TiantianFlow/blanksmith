import { describe, expect, it } from "vitest";

import { t, bcp47Tag, type Language, type MessageKey, messageKeys } from "./messages";

describe("messages — string table completeness", () => {
  it("every en key has a zh_CN translation", () => {
    for (const key of messageKeys) {
      const en = t(key, "en");
      const zh = t(key, "zh_CN");
      expect(en, `key "${key}" missing en`).toBeTruthy();
      expect(zh, `key "${key}" missing zh_CN`).toBeTruthy();
    }
  });

  it("messageKeys is non-empty", () => {
    expect(messageKeys.length).toBeGreaterThan(0);
  });

  it("English product name is Blanksmith (user-benefit-led, no boundary vocabulary)", () => {
    expect(t("extName", "en")).toBe("Blanksmith");
  });

  it("English settings title uses Blanksmith", () => {
    expect(t("settingsTitle", "en")).toBe("Blanksmith — Settings");
  });

  it("Chinese product name remains 原地打开", () => {
    expect(t("extName", "zh_CN")).toBe("原地打开");
  });

  it("Chinese settings title remains 原地打开 — 设置", () => {
    expect(t("settingsTitle", "zh_CN")).toBe("原地打开 — 设置");
  });
});

describe("t — translation function", () => {
  it("returns English for en", () => {
    expect(t("includeBtn", "en")).toBe("Include this site");
  });

  it("returns natural Chinese for zh_CN", () => {
    expect(t("includeBtn", "zh_CN")).toBe("启用此站点");
  });

  it("falls back to en for unknown language", () => {
    expect(t("includeBtn", "fr" as Language)).toBe("Include this site");
  });

  it("returns the key itself for an unknown key (defensive)", () => {
    expect(t("nonexistentKey" as MessageKey, "en")).toBe("nonexistentKey");
  });

  it("supports substitution placeholders", () => {
    expect(t("notEnabledOn", "en", "example.com")).toBe(
      "Not enabled on example.com. Click Include to convert same-property _blank links here.",
    );
    expect(t("notEnabledOn", "zh_CN", "example.com")).toContain("example.com");
  });
});

describe("zh_CN copy quality — natural browser-extension UX", () => {
  it("uses a natural product name, not a literal translation", () => {
    expect(t("extName", "zh_CN")).toBe("原地打开");
  });
  it("uses 启用/停用 for include/exclude, not 纳入/排除", () => {
    expect(t("includeBtn", "zh_CN")).toBe("启用此站点");
    expect(t("excludeBtn", "zh_CN")).toBe("停用此站点");
  });

  it("uses 域名 for host, not 主机", () => {
    expect(t("scopeHost", "zh_CN")).toBe("仅当前域名");
    expect(t("exactSameHost", "zh_CN")).toBe("仅当前地址");
    expect(t("boundaryHost", "zh_CN")).toBe("仅同一地址");
  });

  it("distinguishes site-level (含子域名) from host-level (仅同一地址) boundaries", () => {
    // The site boundary matches by eTLD+1 (subdomains included);
    // the host boundary matches by exact hostname only.
    // The Chinese labels must make this distinction clear.
    const siteLabel = t("sameRegistrableDomain", "zh_CN");
    const hostLabel = t("exactSameHost", "zh_CN");
    // Site label mentions 子域名; host label does not.
    expect(siteLabel).toContain("子域名");
    expect(hostLabel).not.toContain("子域名");
    // Host label uses 地址 to distinguish from 域名.
    expect(hostLabel).toContain("地址");
    // Settings boundary labels also distinguish.
    expect(t("boundarySite", "zh_CN")).toContain("子域名");
    expect(t("boundaryHost", "zh_CN")).toContain("地址");
    expect(t("boundaryHost", "zh_CN")).not.toContain("子域名");
  });

  it("uses 转为当前页打开 for convert, not 转换", () => {
    expect(t("convertsLabel", "zh_CN")).toBe("转为当前页打开");
    expect(t("convertAllLabel", "zh_CN")).toContain("拦截");
  });

  it("uses 保留新标签页 for preserve exits, not 保留退出", () => {
    expect(t("preserveExits", "zh_CN")).toContain("新标签页");
    expect(t("preserveLabel", "zh_CN")).toContain("新标签页");
  });

  it("uses 同站 for same property, not 同属性", () => {
    expect(t("sameRegistrableDomain", "zh_CN")).toContain("同站");
    expect(t("boundarySite", "zh_CN")).toContain("同站");
  });

  it("uses natural explanation copy, not technical jargon", () => {
    expect(t("explanationP2", "zh_CN")).toContain("同一网站");
    expect(t("explanationP2", "zh_CN")).not.toContain("共同所有权");
  });

  it("uses 本站 for thisSite, not 此站点", () => {
    expect(t("thisSite", "zh_CN")).toBe("本站");
  });

  it("uses 跳转范围 for destination boundary, not 目标边界", () => {
    expect(t("destinationBoundary", "zh_CN")).toBe("跳转范围");
  });

  it("uses natural status messages with 启用, not 纳入", () => {
    expect(t("includedActivated", "zh_CN")).toContain("已启用");
    expect(t("excluded", "zh_CN")).toContain("已停用");
    expect(t("settingsTitle", "zh_CN")).toContain("原地打开");
  });

  it("uses 已暂停 for paused indicator, not 已停用", () => {
    expect(t("pausedIndicator", "zh_CN")).toBe("已暂停");
  });

  it("uses {0} placeholder in related count label", () => {
    expect(t("relatedCountLabel", "en")).toContain("{0}");
    expect(t("relatedCountLabel", "zh_CN")).toContain("{0}");
  });

  it("has an advancedBadge key", () => {
    expect(t("advancedBadge", "en")).toBe("Advanced");
    expect(t("advancedBadge", "zh_CN")).toBe("高级");
  });

  it("has an explanationSummary key for the details lead", () => {
    expect(t("explanationSummary", "en")).not.toBe("explanationSummary");
    expect(t("explanationSummary", "zh_CN")).not.toBe("explanationSummary");
    // Must not contain raw HTML tags (it's a plain summary)
    expect(t("explanationSummary", "en")).not.toContain("<");
  });

  it("convert-all example mentions rel=external, downloads, and modifier clicks remain new tabs", () => {
    const example = t("convertAllExample", "en");
    expect(example).toContain("rel=external");
    expect(example).toContain("download");
    expect(example.toLowerCase()).toContain("modifier");
  });
});

describe("bcp47Tag — BCP 47 mapping for document.documentElement.lang", () => {
  it("maps en to en", () => {
    expect(bcp47Tag("en")).toBe("en");
  });

  it("maps zh_CN to zh-CN (hyphen, not underscore)", () => {
    expect(bcp47Tag("zh_CN")).toBe("zh-CN");
  });
});

describe("t — thisSite fallback is localized", () => {
  it("returns localized thisSite for en", () => {
    expect(t("thisSite", "en")).toBe("this site");
  });

  it("returns localized thisSite for zh_CN", () => {
    expect(t("thisSite", "zh_CN")).toBe("本站");
  });
});

describe("document.title keys — suitable for browser tab title", () => {
  it("settingsTitle is a complete title for the Settings tab", () => {
    // Must be a full title, not just a product name
    expect(t("settingsTitle", "en")).toContain("Settings");
    expect(t("settingsTitle", "zh_CN")).toContain("设置");
  });

  it("extName is a standalone product name for the popup title", () => {
    expect(t("extName", "en")).not.toContain("Settings");
    expect(t("extName", "zh_CN")).not.toContain("设置");
  });
});
