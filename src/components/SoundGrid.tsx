// Drop-sound picker: click to hear a sound and choose it.
import { useRef } from "react";
import { soundUrl } from "../state/files";
import { SOUNDS } from "../lib/simple";
import { Icon } from "./icons";

export function SoundGrid({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const play = async (file: string) => {
    const url = await soundUrl(file);
    if (!url) return;
    audio.current?.pause();
    audio.current = new Audio(url);
    audio.current.volume = 0.6;
    audio.current.play().catch(() => {});
  };
  return (
    <div className="sound-grid">
      <button className={`sound-btn ${value == null ? "on" : ""}`} onClick={() => onChange(undefined)}>
        <Icon name="x" size={14} /> None
      </button>
      {SOUNDS.map((s) => (
        <button
          key={s.id}
          className={`sound-btn ${value === s.id ? "on" : ""}`}
          onClick={() => {
            play(s.file);
            onChange(s.id);
          }}
          title="Click to hear it and choose it"
        >
          <Icon name="sound" size={14} /> {s.label.replace("Sound ", "")}
        </button>
      ))}
    </div>
  );
}

