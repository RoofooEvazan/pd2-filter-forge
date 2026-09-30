import { describe, expect, it } from "vitest";
import { editDistance, suggestItemCode, suggestKeyword, suggestOutputKeyword } from "./suggest";

describe("suggestions", () => {
  it("measures typos", () => {
    expect(editDistance("BARARIAN", "BARBARIAN")).toBe(1);
    expect(editDistance("ab", "ba")).toBe(1);
  });
  it("fixes keyword typos and case", () => {
    expect(suggestKeyword("BARARIAN")[0].text).toBe("BARBARIAN");
    expect(suggestKeyword("Eth")[0].text).toBe("ETH");
    expect(suggestKeyword("SOCKET").map((s) => s.text)).toContain("SOCKETS");
  });
  it("fixes item codes and names typed as codes", () => {
    expect(suggestItemCode("bux").map((s) => s.text)).toContain("buc");
    expect(suggestItemCode("shako")[0].text).toBe("uap");
  });
  it("fixes output keywords", () => {
    expect(suggestOutputKeyword("RUNNAME")[0].text).toBe("%RUNENAME%");
  });
});
