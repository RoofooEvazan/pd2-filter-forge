// Simple mode's "Loot preview": a pile of typical drops shown the way your filter will show them.
import { useState } from "react";
import { lookupCode } from "../lib/data";
import type { TestItem } from "../lib/item";
import { LootPile } from "./LabView";

export function PreviewView() {
  const [picked, setPicked] = useState<TestItem | null>(null);
  return (
    <div className="page">
      <h2>Loot preview</h2>
      <p className="lead">
        A pile of typical drops, drawn the way your filter shows them on the ground. Switch the strictness level to see what gets hidden. The list at the top left and the minimap at the top right show your drop alerts.
      </p>
      <LootPile big onPick={setPicked} />
      {picked && (
        <p className="muted" style={{ marginTop: 12 }}>
          That's {lookupCode(picked.code)?.n ?? picked.code}. To change how it looks, go to <b>Items</b> and find it in its category or with the search box.
        </p>
      )}
    </div>
  );
}
