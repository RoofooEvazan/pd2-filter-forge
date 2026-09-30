// Posts for the Roofoo Discord's LOOT FILTER BUILDER channels. The app fills in each channel's
// pinned prompt, the player copies it, attaches the files and posts it from their own account.

export const DISCORD = {
  server: "1363608297663631460",
  /** Invite for people who aren't members yet (empty = not set up). */
  invite: "",
  channels: {
    help: { id: "1554524243675316285", name: "filter-help" },
    share: { id: "1554524317901914203", name: "share-your-filter" },
  },
};

export type PostKind = keyof typeof DISCORD.channels;

export const channelUrl = (k: PostKind) => `https://discord.com/channels/${DISCORD.server}/${DISCORD.channels[k].id}`;
/** Opens the channel straight in the Discord app when it's installed. */
export const channelAppUrl = (k: PostKind) => `discord://-/channels/${DISCORD.server}/${DISCORD.channels[k].id}`;

/** Discord's message limit for accounts without Nitro. */
export const DISCORD_LIMIT = 2000;

export interface Field {
  key: string;
  label: string;
  hint: string;
  multiline?: boolean;
}

/** The pinned prompts, in their order. */
export const HELP_FIELDS: Field[] = [
  { key: "problem", label: "Problem", hint: "What happened?", multiline: true },
  { key: "expected", label: "Expected", hint: "What should have happened?", multiline: true },
  { key: "where", label: "Where", hint: "In PD2 Filter Forge or in game?" },
  { key: "filter", label: "Filter", hint: "Base filter and active filter level." },
  { key: "item", label: "Item", hint: "Name, quality, sockets and ethereal status, if relevant." },
  { key: "steps", label: "Steps", hint: "How can we reproduce it?", multiline: true },
  { key: "setup", label: "Setup", hint: "The filter file (attached)." },
  { key: "screenshot", label: "Screenshot", hint: "Attach one if you can." },
  { key: "device", label: "Browser/device", hint: "App version and system." },
  { key: "downloaded", label: "Downloaded", hint: "When did you last download or save your filter?" },
];

export const SHARE_FIELDS: Field[] = [
  { key: "name", label: "Setup name", hint: "What's it called?" },
  { key: "madeFor", label: "Made for", hint: "Leveling, mapping, your build, or another use." },
  { key: "filter", label: "Base filter and filter level", hint: "What it's built on, and the level you play." },
  { key: "changed", label: "What you changed", hint: "Colors, sounds, tiers or show/hide choices.", multiline: true },
  { key: "preview", label: "Preview", hint: "Attach a screenshot of your theme or item test." },
  { key: "link", label: "Share link", hint: "The filter file (attached), or a link to it." },
];

export const fieldsFor = (k: PostKind) => (k === "help" ? HELP_FIELDS : SHARE_FIELDS);

/** The post text: one "Label: value" line per filled field, like the pinned prompt. */
export function buildPost(kind: PostKind, values: Record<string, string>, extra?: string): string {
  const title = kind === "help" ? "**Filter help**" : "**Show us your filter**";
  const lines = [title];
  for (const f of fieldsFor(kind)) {
    const v = (values[f.key] ?? "").trim();
    if (!v) continue;
    lines.push(v.includes("\n") ? `**${f.label}:**\n${v}` : `**${f.label}:** ${v}`);
  }
  if (extra?.trim()) lines.push("", extra.trim());
  lines.push("", "-# Posted with PD2 Filter Forge");
  return lines.join("\n");
}

export interface FilterFacts {
  fileName: string;
  origin?: string;
  levelName?: string;
  level: number;
  version: string;
  simpleChanges: number;
  mysteries: string[];
  shopTargets: string[];
  problems: { breaks: number; broadens: number; other: number };
  savedAt?: number;
}

/** Everything the app already knows, pre-filled into the prompt. */
export function prefill(kind: PostKind, f: FilterFacts): Record<string, string> {
  const filter = `${f.fileName}${f.origin && !/^New /.test(f.origin) ? ` (based on ${f.origin})` : ""} · level ${f.level}${f.levelName ? ` – ${f.levelName}` : ""}`;
  if (kind === "help")
    return {
      where: "PD2 Filter Forge",
      filter,
      setup: `${f.fileName} attached`,
      device: `PD2 Filter Forge ${f.version} on Windows`,
      downloaded: f.savedAt ? `Last saved ${new Date(f.savedAt).toLocaleString()}` : "",
    };
  const changed: string[] = [];
  if (f.simpleChanges) changed.push(`${f.simpleChanges} item style change${f.simpleChanges === 1 ? "" : "s"} (colors, sounds, icons, hides)`);
  if (f.mysteries.length) changed.push(`mystery drops: ${f.mysteries.join(", ")}`);
  if (f.shopTargets.length) changed.push(`shop hunting: ${f.shopTargets.join(", ")}`);
  return {
    name: f.fileName.replace(/\.filter$/i, ""),
    filter,
    changed: changed.join("\n"),
    link: `${f.fileName} attached`,
  };
}

/** A short problem summary to add to a help post (the full report goes in the attached .txt). */
export function problemSummary(p: FilterFacts["problems"]): string {
  const total = p.breaks + p.broadens + p.other;
  if (!total) return "";
  const parts = [p.breaks && `${p.breaks} never work${p.breaks === 1 ? "s" : ""}`, p.broadens && `${p.broadens} match${p.broadens === 1 ? "es" : ""} too much`, p.other && `${p.other} other`].filter(Boolean);
  return `Filter Forge found ${total} problem${total === 1 ? "" : "s"} (${parts.join(", ")}). The full report is attached as a .txt.`;
}
