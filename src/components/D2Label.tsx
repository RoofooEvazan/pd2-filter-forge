// In-game style rendering of item text and minimap icons.
import type { Rendered, Run, Effects } from "../lib/output";
import { cssColor, ICON_KINDS } from "../lib/output";
import { paletteCss } from "../lib/explain";

export function Runs({ lines }: { lines: Run[][] }) {
  return (
    <>
      {lines.map((ln, i) => (
        <div key={i}>
          {ln.length === 0 ? " " : ln.map((r, j) => (
            <span key={j} style={{ color: cssColor(r.color) }}>
              {r.text}
            </span>
          ))}
        </div>
      ))}
    </>
  );
}

/** A ground label. `showDesc` renders the description above the name, as the tooltip does. */
export function D2Label({ r, showDesc, hiddenText = "hidden", title }: { r: Rendered; showDesc?: boolean; hiddenText?: string; title?: string }) {
  if (r.hidden) {
    return (
      <span className="d2 hidden" title={title}>
        {hiddenText}
      </span>
    );
  }
  return (
    <span className="d2" title={title}>
      {showDesc && r.desc.length > 0 && (
        <span className="desc">
          <Runs lines={r.desc} />
        </span>
      )}
      <Runs lines={r.lines} />
    </span>
  );
}

export function MapIcons({ fx, size = 1 }: { fx: Effects; size?: number }) {
  return (
    <span className="row" style={{ gap: 4, transform: `scale(${size})` }}>
      {ICON_KINDS.filter((k) => fx[k]).map((k) => (
        <span key={k} className={`mapicon ${k}`} style={{ color: paletteCss(fx[k]) }} title={`${k.toUpperCase()}-${fx[k]}`} />
      ))}
    </span>
  );
}
