import { describe, expect, it } from "vitest";
import { compareVersions } from "./updates";

describe("compareVersions", () => {
  it("orders releases numerically, ignoring a leading v", () => {
    expect(compareVersions("v0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.2.0", "v0.2.0")).toBe(0);
    expect(compareVersions("0.2", "0.2.1")).toBe(-1);
  });
  it("puts pre-releases before the release", () => {
    expect(compareVersions("0.3.0-beta.1", "0.3.0")).toBe(-1);
    expect(compareVersions("0.3.0-beta.1", "0.2.9")).toBe(1);
  });
});
