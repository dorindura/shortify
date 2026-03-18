"use client";

type TextOverlayPosition = "top" | "center" | "bottom";

type TextOverlay = {
  id: string;
  clipIndex: number;
  text: string;
  startSec: number;
  endSec: number;
  position: TextOverlayPosition;
};

type Props = {
  overlays: TextOverlay[];
  clipCount: number;
  onChange: (next: TextOverlay[]) => void;
};

function toNumber(value: string, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function TextOverlayEditor(
  { overlays, clipCount, onChange }: Props,
) {
  function addOverlay() {
    onChange([
      ...overlays,
      {
        id: crypto.randomUUID(),
        clipIndex: 0,
        text: "",
        startSec: 0,
        endSec: 2,
        position: "bottom",
      },
    ]);
  }

  function removeOverlay(id: string) {
    onChange(overlays.filter((overlay) => overlay.id !== id));
  }

  function updateOverlay(id: string, patch: Partial<TextOverlay>) {
    onChange(
      overlays.map((
        overlay,
      ) => (overlay.id === id ? { ...overlay, ...patch } : overlay)),
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">
            Text overlays
          </div>
          <div className="text-[10px] text-slate-500">
            Optional drawtext overlays for final render
          </div>
        </div>

        <button
          type="button"
          onClick={addOverlay}
          className="rounded-full border border-emerald-500/60 px-3 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10"
        >
          + Add overlay
        </button>
      </div>

      {overlays.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/80 px-3 py-3 text-xs text-slate-400">
          No overlays yet.
        </div>
      )}

      <div className="space-y-3">
        {overlays.map((overlay, index) => (
          <div
            key={overlay.id}
            className="rounded-xl border border-slate-800/80 bg-slate-950/90 p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-semibold text-slate-200">
                Overlay {index + 1}
              </div>

              <button
                type="button"
                onClick={() => removeOverlay(overlay.id)}
                className="rounded-full border border-rose-500/60 px-2.5 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
              >
                Remove
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-medium text-slate-400">
                  Text
                </label>
                <input
                  type="text"
                  value={overlay.text}
                  onChange={(e) =>
                    updateOverlay(overlay.id, { text: e.target.value })}
                  placeholder="Subscribe for more"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label className="text-[10px] font-medium text-slate-400">
                    Clip
                  </label>
                  <select
                    value={overlay.clipIndex}
                    onChange={(e) =>
                      updateOverlay(overlay.id, {
                        clipIndex: toNumber(e.target.value, 0),
                      })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {Array.from({ length: Math.max(clipCount, 1) }).map((
                      _,
                      idx,
                    ) => (
                      <option key={idx} value={idx}>
                        Clip {idx + 1}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-medium text-slate-400">
                    Start
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={overlay.startSec}
                    onChange={(e) =>
                      updateOverlay(overlay.id, {
                        startSec: toNumber(e.target.value, 0),
                      })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-medium text-slate-400">
                    End
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={overlay.endSec}
                    onChange={(e) =>
                      updateOverlay(overlay.id, {
                        endSec: toNumber(e.target.value, 0),
                      })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-medium text-slate-400">
                    Position
                  </label>
                  <select
                    value={overlay.position}
                    onChange={(e) =>
                      updateOverlay(overlay.id, {
                        position: e.target.value as TextOverlayPosition,
                      })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
