import { actions, useStore } from "../state/store";
import { useAnalysis } from "../state/analysis";

/** The in-game "Filter Level" setting, used by every preview in the app. */
export function LevelPicker({ compact }: { compact?: boolean }) {
  const a = useAnalysis();
  const lvl = useStore((s) => s.ctx.filtlvl);
  const names = a.defs.levels.length ? a.defs.levels.map((l) => l.name) : ["Standard"];
  return (
    <label className="row" title="Preview as if this Filter Level were selected in-game">
      {!compact && <span className="small muted">Preview level</span>}
      <select className="select" value={lvl} onChange={(e) => actions.setCtx({ filtlvl: Number(e.target.value) })} style={{ maxWidth: 220 }}>
        <option value={0}>0 · Show All Items</option>
        {names.slice(0, 12).map((n, i) => (
          <option key={i} value={i + 1}>
            {i + 1} · {n}
          </option>
        ))}
      </select>
    </label>
  );
}
