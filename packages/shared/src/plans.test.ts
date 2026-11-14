import { describe, expect, it } from "vitest";

import { isDataPlan, planGroup, planSummary } from "./plans";

describe("planGroup", () => {
  it.each([
    ["N100 100MB - 24 hrs", "daily"],
    ["MTN 1GB - 1 Day", "daily"],
    ["2GB - 2 days", "daily"],
    ["1.5GB Weekly Plan", "weekly"],
    ["6GB - 7 days", "weekly"],
    ["MTN 10GB - 30 days", "monthly"],
    ["Airtel 4.5GB Monthly", "monthly"],
    ["40GB - 60 days", "other"],
    ["Special bundle", "other"],
  ])("puts %j in %s", (name, group) => {
    expect(planGroup(name)).toBe(group);
  });
});

describe("planSummary", () => {
  it.each([
    ["Airtel Data Bundle - 100 Naira - 75MB - 1Day", { size: "75MB", validity: "1 day" }],
    ["N100 100MB - 24 hrs", { size: "100MB", validity: "24 hrs" }],
    ["Airtel Data - 400 Naira - 1.5GB - 1 day", { size: "1.5GB", validity: "1 day" }],
    ["Airtel Data Bundle - 500 Naira - 750MB - 14 Days", { size: "750MB", validity: "14 days" }],
    ["MTN 10GB - 30 days", { size: "10GB", validity: "30 days" }],
    ["1.5GB Weekly Plan", { size: "1.5GB", validity: "Weekly" }],
  ])("summarises %j", (name, expected) => {
    expect(planSummary(name)).toEqual(expected);
  });

  it("has no size for bundles that aren't data", () => {
    expect(planSummary("600 Naira Voice Bundle")).toEqual({ size: null, validity: null });
    expect(isDataPlan("600 Naira Voice Bundle")).toBe(false);
    expect(isDataPlan("MTN N300 Xtratalk Weekly Bundle")).toBe(false);
    expect(isDataPlan("N100 100MB - 24 hrs")).toBe(true);
  });
});
