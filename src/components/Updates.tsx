// "A new version is available" banner, and the Updates section of Settings.
import { useState } from "react";
import { APP_VERSION, RELEASES_URL, checkForUpdates, dismiss, isDismissed, useUpdate } from "../lib/updates";
import { openExternal } from "../lib/platform";
import { actions } from "../state/store";
import { Markdown } from "./Markdown";
import { Icon } from "./icons";

export function UpdateBanner() {
  const u = useUpdate();
  if (u.status !== "available" || !u.latest || isDismissed(u.latest.version)) return null;
  const v = u.latest.version;
  return (
    <div className="update-banner">
      <Icon name="download" size={16} />
      <div className="grow">
        <b>Filter Forge {v} is available</b> <span className="muted">— you have {APP_VERSION}.</span>
      </div>
      <button className="btn sm" onClick={() => actions.setView("settings")}>
        What's new
      </button>
      <button className="btn sm primary" onClick={() => openExternal(u.latest!.installer ?? u.latest!.url)}>
        Download
      </button>
      <button className="btn sm ghost icon" title="Hide until the next version" onClick={() => dismiss(v)}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

export function UpdatesSettings() {
  const u = useUpdate();
  const [showNotes, setShowNotes] = useState(true);
  const status =
    u.status === "checking"
      ? "Checking…"
      : u.status === "current"
        ? `You're up to date${u.latest ? ` (latest release is ${u.latest.version})` : ""}.`
        : u.status === "available"
          ? `Version ${u.latest!.version} is available.`
          : u.status === "error"
            ? `Couldn't check: ${u.error}`
            : "Checks GitHub for a newer release when the app starts.";
  return (
    <>
      <span>Version</span>
      <div className="col" style={{ gap: 8 }}>
        <div className="row wrap">
          <b className="mono">{APP_VERSION}</b>
          <span className="small muted">{status}</span>
          <button className="btn sm" disabled={u.status === "checking"} onClick={() => checkForUpdates()}>
            Check for updates
          </button>
          <button className="btn sm ghost" onClick={() => openExternal(RELEASES_URL)}>
            All releases <Icon name="link" size={13} />
          </button>
        </div>
        {u.latest && (
          <div className="card" style={{ padding: "10px 14px" }}>
            <div className="row">
              <b className="grow">
                {u.latest.name}
                {u.latest.published && <span className="small muted"> · {new Date(u.latest.published).toLocaleDateString()}</span>}
              </b>
              {u.status === "available" && (
                <>
                  {u.latest.portable && (
                    <button className="btn sm" onClick={() => openExternal(u.latest!.portable!)}>
                      Portable .exe
                    </button>
                  )}
                  <button className="btn sm primary" onClick={() => openExternal(u.latest!.installer ?? u.latest!.url)}>
                    <Icon name="download" size={13} /> Download installer
                  </button>
                </>
              )}
              <button className="btn sm ghost" onClick={() => setShowNotes(!showNotes)}>
                {showNotes ? "Hide" : "Show"} release notes
              </button>
            </div>
            {showNotes && u.latest.notes && <Markdown source={u.latest.notes} />}
          </div>
        )}
      </div>
    </>
  );
}
