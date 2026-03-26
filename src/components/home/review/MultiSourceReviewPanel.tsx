"use client";

import { useEffect, useMemo, useState } from "react";
import { OVERLAY_EMOJIS } from "@lib/overlayEmojis";

type OverlayPosition = "top" | "center" | "bottom";
type EmojiPlacement = "left" | "right";
type EndingType = "none" | "freeze" | "fadeBlack" | "endCard";
type EndingPosition = "top" | "center" | "bottom";
type EndingEmojiPlacement = "left" | "right" | "center";

type TimelineOverlay = {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
  position: OverlayPosition;
  emoji?: string | null;
  emojiPlacement?: EmojiPlacement;
};

type BlackWhiteRange = {
  id: string;
  startSec: number;
  endSec: number;
};

type EndingConfig = {
  type: EndingType;
  text?: string;
  subtext?: string;
  emoji?: string;
  emojiPlacement?: EndingEmojiPlacement;
  position?: EndingPosition;
  durationSec?: number;
};

type ReviewJob = {
  id: string;
  aspect?: "horizontal" | "vertical" | "verticalLetterbox";
  multiSourceEditConfig?: {
    draftVideoUrl?: string;
    reviewConfig?: {
      textOverlays?: TimelineOverlay[];
      blackWhiteRanges?: BlackWhiteRange[];
      ending?: EndingConfig | null;
    };
  };
};

type Props = {
  job: ReviewJob;
  apiBaseUrl: string;
  authedJsonFetch: (input: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
  onRendered?: () => Promise<void> | void;
};

const DEFAULT_ENDING: EndingConfig = {
  type: "none",
  durationSec: 1.2,
  emojiPlacement: "right",
  position: "bottom",
};

export default function MultiSourceReviewPanel({
  job,
  apiBaseUrl,
  authedJsonFetch,
  onClose,
  onSaved,
  onRendered,
}: Props) {
  const draftUrl = job.multiSourceEditConfig?.draftVideoUrl ?? "";
  const reviewConfig = job.multiSourceEditConfig?.reviewConfig;

  const [textOverlays, setTextOverlays] = useState<TimelineOverlay[]>(
    reviewConfig?.textOverlays ?? [],
  );
  const [blackWhiteRanges, setBlackWhiteRanges] = useState<BlackWhiteRange[]>(
    reviewConfig?.blackWhiteRanges ?? [],
  );
  const [ending, setEnding] = useState<EndingConfig>(reviewConfig?.ending ?? DEFAULT_ENDING);

  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    setTextOverlays(reviewConfig?.textOverlays ?? []);
    setBlackWhiteRanges(reviewConfig?.blackWhiteRanges ?? []);
    setEnding(reviewConfig?.ending ?? DEFAULT_ENDING);
  }, [job.id, reviewConfig?.textOverlays, reviewConfig?.blackWhiteRanges, reviewConfig?.ending]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const sortedOverlays = useMemo(
    () => [...textOverlays].sort((a, b) => a.startSec - b.startSec),
    [textOverlays],
  );

  const sortedBwRanges = useMemo(
    () => [...blackWhiteRanges].sort((a, b) => a.startSec - b.startSec),
    [blackWhiteRanges],
  );

  function addOverlay() {
    setTextOverlays((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: "",
        startSec: 0,
        endSec: 2,
        position: "bottom",
        emoji: null,
        emojiPlacement: "left",
      },
    ]);
  }

  function updateOverlay(id: string, patch: Partial<TimelineOverlay>) {
    setTextOverlays((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeOverlay(id: string) {
    setTextOverlays((prev) => prev.filter((item) => item.id !== id));
  }

  function addBlackWhiteRange() {
    setBlackWhiteRanges((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        startSec: 0,
        endSec: 2,
      },
    ]);
  }

  function updateBlackWhiteRange(id: string, patch: Partial<BlackWhiteRange>) {
    setBlackWhiteRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function removeBlackWhiteRange(id: string) {
    setBlackWhiteRanges((prev) => prev.filter((item) => item.id !== id));
  }

  async function saveReview() {
    setSaving(true);
    try {
      const res = await authedJsonFetch(`${apiBaseUrl}/api/multi-source-edit/${job.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          textOverlays,
          blackWhiteRanges,
          ending,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.error ?? "Failed to save review");
        return;
      }

      await onSaved?.();
      alert("Review saved");
    } finally {
      setSaving(false);
    }
  }

  async function renderFinal() {
    setRendering(true);
    try {
      const saveRes = await authedJsonFetch(
        `${apiBaseUrl}/api/multi-source-edit/${job.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            textOverlays,
            blackWhiteRanges,
            ending,
          }),
        },
      );

      const saveData = await saveRes.json().catch(() => ({}));

      if (!saveRes.ok) {
        alert(saveData?.error ?? "Failed to save review");
        return;
      }

      const renderRes = await authedJsonFetch(
        `${apiBaseUrl}/api/multi-source-edit/${job.id}/render`,
        {
          method: "POST",
        },
      );

      const renderData = await renderRes.json().catch(() => ({}));

      if (!renderRes.ok) {
        alert(renderData?.error ?? "Failed to render final video");
        return;
      }

      await onRendered?.();
      onClose();
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-[101] flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 px-4 py-4 sm:px-6">
          <div>
            <h3 className="text-base font-semibold text-slate-50 sm:text-lg">
              Review multi-source edit
            </h3>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              Review the final draft timeline, add overlays, add black & white ranges, and render
              the final output.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-slate-900"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid gap-5 xl:grid-cols-[460px_minmax(0,1fr)]">
            <div className="space-y-5 xl:sticky xl:top-0 xl:self-start">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4">
                <div className="mb-3">
                  <div className="text-sm font-semibold text-slate-100">Draft preview</div>
                  <div className="text-[10px] text-slate-500">
                    Preview the concatenated timeline draft before final render.
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-black">
                  {draftUrl ? (
                    <video
                      src={draftUrl}
                      controls
                      className="h-full w-full bg-black object-contain"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-sm text-slate-500">
                      No draft preview available
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-100">Ending</div>

                <div className="grid gap-2 md:grid-cols-2">
                  {(["none", "freeze", "fadeBlack", "endCard"] as EndingType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setEnding((prev) => ({ ...prev, type }))}
                      className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                        ending.type === type
                          ? "border-sky-500 bg-slate-900/80 text-slate-50"
                          : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-sky-500/60"
                      }`}
                    >
                      <div className="font-semibold">
                        {type === "none"
                          ? "None"
                          : type === "freeze"
                            ? "Freeze frame"
                            : type === "fadeBlack"
                              ? "Fade to black"
                              : "End card"}
                      </div>
                    </button>
                  ))}
                </div>

                {ending.type !== "none" && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[10px] font-medium text-slate-400">Ending text</label>
                      <input
                        type="text"
                        value={ending.text ?? ""}
                        onChange={(e) => setEnding((prev) => ({ ...prev, text: e.target.value }))}
                        placeholder="Follow for more"
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-slate-400">Emoji</label>
                      <select
                        value={ending.emoji ?? ""}
                        onChange={(e) =>
                          setEnding((prev) => ({
                            ...prev,
                            emoji: e.target.value || undefined,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="">No emoji</option>
                        {OVERLAY_EMOJIS.map((emoji) => (
                          <option key={emoji.id} value={emoji.char}>
                            {emoji.char} {emoji.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-slate-400">
                        Emoji placement
                      </label>
                      <select
                        value={ending.emojiPlacement ?? "right"}
                        onChange={(e) =>
                          setEnding((prev) => ({
                            ...prev,
                            emojiPlacement: e.target.value as "left" | "right" | "center",
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="center">Both sides</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-slate-400">Position</label>
                      <select
                        value={ending.position ?? "bottom"}
                        onChange={(e) =>
                          setEnding((prev) => ({
                            ...prev,
                            position: e.target.value as "top" | "center" | "bottom",
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="top">Top</option>
                        <option value="center">Center</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-slate-400">Duration</label>
                      <input
                        type="number"
                        min="0.5"
                        max="3"
                        step="0.1"
                        value={ending.durationSec ?? 1.2}
                        onChange={(e) =>
                          setEnding((prev) => ({
                            ...prev,
                            durationSec: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-5 xl:max-h-[calc(92vh-140px)] xl:overflow-y-auto xl:pr-1">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Timeline overlays</div>
                    <div className="text-[10px] text-slate-500">
                      Add text and emoji overlays to the final concatenated timeline.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addOverlay}
                    className="rounded-xl border border-sky-500/60 px-3 py-2 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/10"
                  >
                    Add overlay
                  </button>
                </div>

                <div className="space-y-3">
                  {sortedOverlays.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 px-3 py-3 text-[11px] text-slate-500">
                      No overlays yet.
                    </div>
                  ) : (
                    sortedOverlays.map((overlay) => (
                      <div
                        key={overlay.id}
                        className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-medium text-slate-400">Text</label>
                            <input
                              type="text"
                              value={overlay.text}
                              onChange={(e) => updateOverlay(overlay.id, { text: e.target.value })}
                              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-medium text-slate-400">
                              Start (sec)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={overlay.startSec}
                              onChange={(e) =>
                                updateOverlay(overlay.id, {
                                  startSec: Number(e.target.value),
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-medium text-slate-400">
                              End (sec)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={overlay.endSec}
                              onChange={(e) =>
                                updateOverlay(overlay.id, {
                                  endSec: Number(e.target.value),
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
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
                                  position: e.target.value as "top" | "center" | "bottom",
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                            >
                              <option value="top">Top</option>
                              <option value="center">Center</option>
                              <option value="bottom">Bottom</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-medium text-slate-400">Emoji</label>
                            <select
                              value={overlay.emoji ?? ""}
                              onChange={(e) =>
                                updateOverlay(overlay.id, {
                                  emoji: e.target.value || null,
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                            >
                              <option value="">No emoji</option>
                              {OVERLAY_EMOJIS.map((emoji) => (
                                <option key={emoji.id} value={emoji.id}>
                                  {emoji.char} {emoji.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-medium text-slate-400">
                              Emoji placement
                            </label>
                            <select
                              value={overlay.emojiPlacement ?? "left"}
                              onChange={(e) =>
                                updateOverlay(overlay.id, {
                                  emojiPlacement: e.target.value as "left" | "right",
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                            >
                              <option value="left">Left</option>
                              <option value="right">Right</option>
                            </select>
                          </div>
                        </div>

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeOverlay(overlay.id)}
                            className="rounded-lg border border-rose-500/50 px-3 py-1.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10"
                          >
                            Remove overlay
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Black & white ranges</div>
                    <div className="text-[10px] text-slate-500">
                      Apply black & white only to selected time ranges on the final timeline.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addBlackWhiteRange}
                    className="rounded-xl border border-emerald-500/60 px-3 py-2 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/10"
                  >
                    Add range
                  </button>
                </div>

                <div className="space-y-3">
                  {sortedBwRanges.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 px-3 py-3 text-[11px] text-slate-500">
                      No black & white ranges yet.
                    </div>
                  ) : (
                    sortedBwRanges.map((range) => (
                      <div
                        key={range.id}
                        className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <div>
                          <label className="text-[10px] font-medium text-slate-400">
                            Start (sec)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={range.startSec}
                            onChange={(e) =>
                              updateBlackWhiteRange(range.id, {
                                startSec: Number(e.target.value),
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-medium text-slate-400">
                            End (sec)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={range.endSec}
                            onChange={(e) =>
                              updateBlackWhiteRange(range.id, {
                                endSec: Number(e.target.value),
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>

                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => removeBlackWhiteRange(range.id)}
                            className="w-full rounded-xl border border-rose-500/50 px-3 py-2 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800/80 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={saveReview}
              disabled={saving || rendering}
              className="rounded-xl border border-sky-500/70 px-4 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save review"}
            </button>

            <button
              type="button"
              onClick={renderFinal}
              disabled={saving || rendering}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow shadow-emerald-500/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rendering ? "Rendering..." : "Render final video"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
