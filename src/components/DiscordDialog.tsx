// Post to the Roofoo Discord: fill in the channel's pinned prompt, copy it, save the files to attach,
// and open the channel. The player posts it from their own account.
import { useMemo, useState } from "react";
import { actions, useStore } from "../state/store";
import { useAnalysis } from "../state/analysis";
import { filterBytes, saveAttachments } from "../state/files";
import { openExternal } from "../lib/platform";
import { APP_VERSION } from "../lib/updates";
import { CHECK_BY_ID } from "../lib/lint";
import { problemsReport } from "../lib/report";
import { readChoices, readMysteries } from "../lib/simple";
import { readShop } from "../lib/shop";
import { DISCORD, DISCORD_LIMIT, buildPost, channelUrl, fieldsFor, prefill, problemSummary, type FilterFacts, type PostKind } from "../lib/discord";
import { Icon } from "./icons";

export function DiscordDialog({ initial }: { initial: PostKind }) {
  const a = useAnalysis();
  const file = useStore((s) => s.file);
  const lvl = useStore((s) => s.ctx.filtlvl);
  const [kind, setKind] = useState<PostKind>(initial);

  const facts: FilterFacts = useMemo(() => {
    const impacts = a.issues.map((i) => CHECK_BY_ID.get(i.check)?.impact);
    return {
      fileName: file?.name ?? "My Filter.filter",
      origin: file?.origin,
      level: lvl,
      levelName: lvl === 0 ? "Show everything" : a.defs.levels[lvl - 1]?.name,
      version: APP_VERSION,
      simpleChanges: readChoices(a.lines).size,
      mysteries: readMysteries(a.lines).map((m) => m.name),
      shopTargets: readShop(a.lines).targets.filter((t) => t.on).map((t) => t.name),
      problems: {
        breaks: impacts.filter((x) => x === "breaks").length,
        broadens: impacts.filter((x) => x === "broadens").length,
        other: impacts.filter((x) => x !== "breaks" && x !== "broadens" && x !== "tidy").length,
      },
    };
  }, [a, file, lvl]);

  const [values, setValues] = useState<Record<PostKind, Record<string, string>>>(() => ({ help: prefill("help", facts), share: prefill("share", facts) }));
  const [withReport, setWithReport] = useState(facts.problems.breaks + facts.problems.broadens + facts.problems.other > 0);
  const [step, setStep] = useState({ copied: false, saved: "" as string, opened: false });

  const v = values[kind];
  const set = (key: string, val: string) => setValues({ ...values, [kind]: { ...v, [key]: val } });
  const extra = kind === "help" && withReport ? problemSummary(facts.problems) : "";
  const post = buildPost(kind, v, extra);
  const over = post.length > DISCORD_LIMIT;
  const baseName = facts.fileName.replace(/\.filter$/i, "");
  const attachments = [
    { name: facts.fileName.endsWith(".filter") ? facts.fileName : `${facts.fileName}.filter`, bytes: filterBytes() },
    ...(kind === "help" && withReport
      ? [{ name: `${baseName} - problems.txt`, bytes: new TextEncoder().encode(problemsReport(a.issues.filter((i) => CHECK_BY_ID.get(i.check)?.impact !== "tidy"), a.lines, { fileName: facts.fileName }).replace(/\n/g, "\r\n")) }]
      : []),
  ];
  const ch = DISCORD.channels[kind];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(post);
      setStep({ ...step, copied: true });
    } catch {
      actions.toast("Couldn't copy — select the preview text and copy it instead.", "err");
    }
  };
  const saveFiles = async () => {
    const where = await saveAttachments(attachments);
    if (where) setStep({ ...step, saved: where });
  };
  const open = () => {
    void openExternal(channelUrl(kind));
    setStep({ ...step, opened: true });
  };
  const close = () => actions.openDiscord(null);

  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="dialog" style={{ width: "min(1040px, 96vw)" }}>
        <div className="dialog-head">
          <Icon name="chat" />
          <h2>Post on the Roofoo Discord</h2>
          <div className="seg" style={{ marginLeft: 12 }}>
            <button className={kind === "help" ? "on" : ""} onClick={() => setKind("help")}>
              Ask for help · #{DISCORD.channels.help.name}
            </button>
            <button className={kind === "share" ? "on" : ""} onClick={() => setKind("share")}>
              Share your filter · #{DISCORD.channels.share.name}
            </button>
          </div>
          <button className="btn icon ghost" onClick={close}>
            <Icon name="x" />
          </button>
        </div>
        <div className="dialog-body discord-body">
          <div className="col" style={{ gap: 10 }}>
            <p className="small muted" style={{ margin: 0 }}>
              {kind === "help"
                ? "Fill in what you can — this follows the channel's pinned prompt. What Filter Forge already knows is filled in for you."
                : "Tell people what your setup is for. What Filter Forge already knows is filled in for you."}
            </p>
            {fieldsFor(kind).map((f) => (
              <label key={f.key} className="field">
                <span className="label">{f.label}</span>
                {f.multiline ? (
                  <textarea className="input" rows={3} placeholder={f.hint} value={v[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <input className="input" placeholder={f.hint} value={v[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                )}
              </label>
            ))}
            {kind === "help" && facts.problems.breaks + facts.problems.broadens + facts.problems.other > 0 && (
              <label className="row small">
                <button className={`switch ${withReport ? "on" : ""}`} onClick={() => setWithReport(!withReport)} />
                Include Filter Forge's problem report (a summary line plus a .txt to attach)
              </label>
            )}
          </div>

          <div className="col" style={{ gap: 12 }}>
            <div>
              <div className="row">
                <div className="section-title grow">Your post</div>
                <span className={`small ${over ? "warn-text" : "faint"}`}>
                  {post.length} / {DISCORD_LIMIT}
                </span>
              </div>
              <textarea className="input mono discord-preview" readOnly value={post} onFocus={(e) => e.currentTarget.select()} />
              {over && <div className="small warn-text">Discord only allows {DISCORD_LIMIT} characters per message. Shorten the longer answers.</div>}
            </div>

            <ol className="discord-steps">
              <li className={step.copied ? "done" : ""}>
                <button className="btn primary" onClick={copy} disabled={over}>
                  <Icon name="copy" size={15} /> Copy the post
                </button>
              </li>
              <li className={step.saved ? "done" : ""}>
                <button className="btn" onClick={saveFiles}>
                  <Icon name="save" size={15} /> Save the file{attachments.length > 1 ? "s" : ""} to attach
                </button>
                <div className="small muted">
                  {attachments.map((x) => x.name).join(" + ")}
                  {step.saved && <> · saved to {step.saved}</>}
                </div>
              </li>
              <li className={step.opened ? "done" : ""}>
                <button className="btn" onClick={open}>
                  <Icon name="chat" size={15} /> Open #{ch.name}
                </button>
                {DISCORD.invite && (
                  <button className="btn ghost sm" onClick={() => openExternal(DISCORD.invite)}>
                    Not in the server yet? Join
                  </button>
                )}
              </li>
              <li>
                In Discord, paste with <span className="kbd">Ctrl V</span>, drag in the saved file{attachments.length > 1 ? "s" : ""}
                {kind === "share" ? " and a screenshot" : " (and a screenshot if you have one)"}, then press Enter.
              </li>
            </ol>
            <div className="small faint">Nothing is posted automatically — it goes out from your own Discord account when you press Enter.</div>
          </div>
        </div>
      </div>
    </>
  );
}
