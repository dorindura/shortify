"use client";

type Props = {
  clipCount: number;
  selectedClipIndex: number;
  onSelect: (index: number) => void;
};

export default function ClipTabs(
  { clipCount, selectedClipIndex, onSelect }: Props,
) {
  if (clipCount <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: clipCount }).map((_, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onSelect(idx)}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
            selectedClipIndex === idx
              ? "border-sky-500 bg-sky-500/15 text-sky-300"
              : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-sky-500/60"
          }`}
        >
          Clip {idx + 1}
        </button>
      ))}
    </div>
  );
}
