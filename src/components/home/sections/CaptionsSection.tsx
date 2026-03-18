import type { LocalCaptionStyle } from "../home.types";

type Props = {
  captionsEnabled: boolean;
  setCaptionsEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  captionStyle: LocalCaptionStyle;
  setCaptionStyle: (value: LocalCaptionStyle) => void;
};

export default function CaptionsSection({
  captionsEnabled,
  setCaptionsEnabled,
  captionStyle,
  setCaptionStyle,
}: Props) {
  return (
    <div className="mt-4 border-t border-slate-800/80 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-50">Captions</h2>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[11px]">
          <span className="text-slate-400">AI captions</span>
          <button
            type="button"
            onClick={() => setCaptionsEnabled((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full border transition ${
              captionsEnabled
                ? "border-emerald-400 bg-emerald-500/20"
                : "border-slate-600 bg-slate-800/80"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-slate-100 shadow transition ${
                captionsEnabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
      </div>

      <fieldset
        className={`mt-3 grid gap-3 text-xs text-slate-200 md:grid-cols-3 ${
          !captionsEnabled ? "pointer-events-none opacity-40" : ""
        }`}
      >
        <legend className="mb-1 text-[10px] tracking-[0.16em] text-slate-500 uppercase">
          Caption style
        </legend>

        <label className="group relative flex cursor-pointer flex-col rounded-xl border border-slate-800/90 bg-slate-950/80 px-3 py-3 text-[11px] shadow-sm shadow-black/40 transition hover:border-sky-500/60">
          <input
            type="radio"
            name="captionStyle"
            value="karaoke"
            checked={captionStyle === "karaoke"}
            onChange={() => setCaptionStyle("karaoke")}
            className="peer sr-only"
          />
          <span className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">Karaoke</span>
            <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-sky-300">
              Outlined
            </span>
          </span>
          <span className="mt-1 text-[10px] text-slate-400">
            Dynamic word highlighting with bold outline.
          </span>
          <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-sky-500/0 transition peer-checked:ring-sky-500/80" />
        </label>

        <label className="group relative flex cursor-pointer flex-col rounded-xl border border-slate-800/90 bg-slate-950/80 px-3 py-3 text-[11px] shadow-sm shadow-black/40 transition hover:border-sky-500/60">
          <input
            type="radio"
            name="captionStyle"
            value="boldYellow"
            checked={captionStyle === "boldYellow"}
            onChange={() => setCaptionStyle("boldYellow")}
            className="peer sr-only"
          />
          <span className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">Bold yellow</span>
            <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-amber-300">
              High impact
            </span>
          </span>
          <span className="mt-1 text-[10px] text-slate-400">
            Classic short-form look with strong emphasis.
          </span>
          <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-sky-500/0 transition peer-checked:ring-sky-500/80" />
        </label>

        <label className="group relative flex cursor-pointer flex-col rounded-xl border border-slate-800/90 bg-slate-950/80 px-3 py-3 text-[11px] shadow-sm shadow-black/40 transition hover:border-sky-500/60">
          <input
            type="radio"
            name="captionStyle"
            value="subtle"
            checked={captionStyle === "subtle"}
            onChange={() => setCaptionStyle("subtle")}
            className="peer sr-only"
          />
          <span className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">Subtle & clean</span>
            <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-300">
              Minimal
            </span>
          </span>
          <span className="mt-1 text-[10px] text-slate-400">
            Low-noise captions that stay out of the way.
          </span>
          <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-sky-500/0 transition peer-checked:ring-sky-500/80" />
        </label>
      </fieldset>
    </div>
  );
}