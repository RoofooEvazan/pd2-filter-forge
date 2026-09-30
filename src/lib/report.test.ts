import { describe, expect, it } from "vitest";
import { parseFilter } from "./document";
import { lintDoc } from "./lint";
import { problemsReport } from "./report";

describe("problems report for AI", () => {
  it("lists each problem with its line, explanation, suggestion and fix preview", () => {
    const doc = parseFilter(["Alias[MARK]: ILVL>50", "Alias[OUTER]: (rin MARK)", "ItemDisplay[OUTER]: %NAME%", "ItemDisplay[RARE ILVL>=80]: %NAME%"].join("\n"));
    const issues = lintDoc(doc);
    const text = problemsReport(issues, doc.lines, { fileName: "Test.filter" });
    expect(text).toContain('"Test.filter"');
    expect(text).toContain("How PD2's filter engine reads filters");
    expect(text).toContain("Line 4 — >=, <=, == or != in conditions");
    expect(text).toContain("Line:        ItemDisplay[RARE ILVL>=80]: %NAME%");
    expect(text).toContain("-> ItemDisplay[RARE ILVL>79]: %NAME%");
    expect(text).toContain("(certain)");
    expect(text).toMatch(/move line \d+ to just (below|above) line \d+/);
    expect(text).not.toContain("undefined");
  });
});
