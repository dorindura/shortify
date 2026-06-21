import type { LocalJobAspect, LocalShortsOutputMode } from "../home.types";

type Props = {
  aspect: LocalJobAspect;
  setAspect: (value: LocalJobAspect) => void;
  shortsOutputMode: LocalShortsOutputMode;
  setShortsOutputMode: (value: LocalShortsOutputMode) => void;
  showLocalOutputModes: boolean;
  isQuoteReel: boolean;
  optimizedLabel: string;
};

export default function OutputFormatSection({
  aspect,
  setAspect,
  shortsOutputMode,
  setShortsOutputMode,
  showLocalOutputModes,
  isQuoteReel,
  optimizedLabel,
}: Props) {
  const useLocalFullX2 = showLocalOutputModes && shortsOutputMode === "full_x2_local";

  return (
    <div className={`space-y-3 ${isQuoteReel ? "pointer-events-none opacity-40" : ""}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-50">Output format</h2>
        <span className="text-[10px] text-slate-500">Optimized for {optimizedLabel}</span>
      </div>

      <div
        className={`grid grid-cols-1 gap-3 ${
          showLocalOutputModes ? "sm:grid-cols-4" : "sm:grid-cols-3"
        }`}
      >
        <label className="group relative">
          <input
            type="radio"
            name="aspect"
            value="horizontal"
            checked={!useLocalFullX2 && aspect === "horizontal"}
            onChange={() => {
              setShortsOutputMode("shorts");
              setAspect("horizontal");
            }}
            className="peer sr-only"
          />
          <div className="flex h-full cursor-pointer flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-950/80 px-4 py-3 text-xs text-slate-200 shadow-sm shadow-black/40 transition group-hover:border-sky-500/60 peer-checked:border-sky-500 peer-checked:bg-slate-900/80">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Horizontal 16:9</span>
              <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-400">
                YouTube / Desktop
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-6 w-10 rounded-lg border border-slate-700 bg-slate-900" />
              <p className="text-[11px] text-slate-400">
                Great for YouTube videos & landscape content.
              </p>
            </div>
          </div>
        </label>

        <label className="group relative">
          <input
            type="radio"
            name="aspect"
            value="vertical"
            checked={!useLocalFullX2 && aspect === "vertical"}
            onChange={() => {
              setShortsOutputMode("shorts");
              setAspect("vertical");
            }}
            className="peer sr-only"
          />
          <div className="flex h-full cursor-pointer flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-950/80 px-4 py-3 text-xs text-slate-200 shadow-sm shadow-black/40 transition group-hover:border-sky-500/60 peer-checked:border-sky-500 peer-checked:bg-slate-900/80">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Vertical 9:16</span>
              <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-sky-300">
                TikTok / Reels / Shorts
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex h-10 w-6 items-center justify-center rounded-lg border border-slate-700 bg-slate-900">
                <div className="h-7 w-4 rounded-md bg-slate-800" />
              </div>
              <p className="text-[11px] text-slate-400">
                Optimized for mobile-first, 9:16 short-form platforms.
              </p>
            </div>
          </div>
        </label>

        <label className="group relative">
          <input
            type="radio"
            name="aspect"
            value="verticalLetterbox"
            checked={!useLocalFullX2 && aspect === "verticalLetterbox"}
            onChange={() => {
              setShortsOutputMode("shorts");
              setAspect("verticalLetterbox");
            }}
            className="peer sr-only"
          />
          <div className="flex h-full cursor-pointer flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-950/80 px-4 py-3 text-xs text-slate-200 shadow-sm shadow-black/40 transition group-hover:border-sky-500/60 peer-checked:border-sky-500 peer-checked:bg-slate-900/80">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">9:16 Letterbox</span>
              <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-200">
                Black bars
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <div className="flex h-10 w-6 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
                <div className="flex h-full w-full flex-col">
                  <div className="h-2 bg-slate-950" />
                  <div className="flex-1 bg-slate-800" />
                  <div className="h-2 bg-slate-950" />
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Keeps more of the full action visible with black bars.
              </p>
            </div>
          </div>
        </label>

        {showLocalOutputModes && (
          <label className="group relative">
            <input
              type="radio"
              name="aspect"
              value="full_x2_local"
              checked={useLocalFullX2}
              onChange={() => setShortsOutputMode("full_x2_local")}
              className="peer sr-only"
            />
            <div className="flex h-full cursor-pointer flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-950/80 px-4 py-3 text-xs text-slate-200 shadow-sm shadow-black/40 transition group-hover:border-emerald-500/60 peer-checked:border-emerald-500 peer-checked:bg-slate-900/80">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Full x2 local</span>
                <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-emerald-300">
                  Local
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex h-7 w-10 items-center justify-center rounded-lg border border-emerald-500/40 bg-slate-900 text-[10px] font-semibold text-emerald-300">
                  2x
                </div>
                <p className="text-[11px] text-slate-400">
                  Saves the entire source video to local disk only.
                </p>
              </div>
            </div>
          </label>
        )}
      </div>
    </div>
  );
}
