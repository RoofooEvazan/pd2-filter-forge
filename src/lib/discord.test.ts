import { describe, expect, it } from "vitest";
import { buildPost, channelUrl, prefill, problemSummary, type FilterFacts } from "./discord";

const facts: FilterFacts = {
  fileName: "Roofoo.filter", origin: "Launcher · Roofoo", level: 4, levelName: "Recommended", version: "0.3.1",
  simpleChanges: 3, mysteries: ["Lucky Bastard"], shopTargets: ["+3 Lightning"], problems: { breaks: 1, broadens: 2, other: 0 },
};

describe("discord posts", () => {
  it("fill the #filter-help prompt in the pinned order and skip empty fields", () => {
    const post = buildPost("help", { ...prefill("help", facts), problem: "Ber shows as white" }, problemSummary(facts.problems));
    expect(post.split("\n").slice(0, 3)).toEqual(["**Filter help**", "**Problem:** Ber shows as white", "**Where:** PD2 Filter Forge"]);
    expect(post).toContain("**Filter:** Roofoo.filter (based on Launcher · Roofoo) · level 4 – Recommended");
    expect(post).toContain("Filter Forge found 3 problems (1 never works, 2 match too much)");
    expect(post).not.toContain("**Expected:**");
  });
  it("summarise what changed for #share-your-filter", () => {
    const v = prefill("share", facts);
    expect(v.name).toBe("Roofoo");
    expect(v.changed).toContain("mystery drops: Lucky Bastard");
    expect(buildPost("share", v)).toContain("**Share link:** Roofoo.filter attached");
  });
  it("links to the right channels", () => {
    expect(channelUrl("help")).toBe("https://discord.com/channels/1363608297663631460/1554524243675316285");
    expect(channelUrl("share")).toBe("https://discord.com/channels/1363608297663631460/1554524317901914203");
  });
});
