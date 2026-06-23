"use client";

import { useEffect, useMemo, useState } from "react";
import ReviewVideoPreview from "./ReviewVideoPreview";
import TextOverlayEditor from "./TextOverlayEditor";
import { OVERLAY_EMOJIS } from "@lib/overlayEmojis";

type OverlayPosition = "top" | "center" | "bottom";
type EmojiPlacement = "left" | "right";
type EndingType = "none" | "freeze" | "fadeBlack" | "endCard";
type EndingPosition = "top" | "center" | "bottom";
type EndingEmojiPlacement = "left" | "right" | "center";

type TimelineOverlay = {
  id: string;
  clipIndex: number;
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
  aspect?: "horizontal" | "vertical" | "verticalLetterbox" | "verticalFit";
  multiSourceEditConfig?: {
    draftVideoUrl?: string;
    reviewConfig?: {
      textOverlays?: Partial<TimelineOverlay>[];
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

function normalizeOverlays(overlays?: Partial<TimelineOverlay>[]): TimelineOverlay[] {
  return (overlays ?? []).map((overlay) => ({
    id: overlay.id ?? crypto.randomUUID(),
    clipIndex: 0,
    text: overlay.text ?? "",
    startSec: Number(overlay.startSec ?? 0),
    endSec: Number(overlay.endSec ?? 2),
    position: overlay.position ?? "bottom",
    emoji: overlay.emoji ?? null,
    emojiPlacement: overlay.emojiPlacement ?? "left",
  }));
}

function hasFullTimelineBlackWhite(ranges: BlackWhiteRange[] | undefined) {
  return (ranges ?? []).some((range) => range.startSec <= 0 && range.endSec >= 3600);
}

function toTimelineOverlayPayload({
  id,
  text,
  startSec,
  endSec,
  position,
  emoji,
  emojiPlacement,
}: TimelineOverlay) {
  return { id, text, startSec, endSec, position, emoji, emojiPlacement };
}

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

  const [overlays, setOverlays] = useState<TimelineOverlay[]>(
    normalizeOverlays(reviewConfig?.textOverlays),
  );
  const [blackAndWhite, setBlackAndWhite] = useState<boolean>(
    hasFullTimelineBlackWhite(reviewConfig?.blackWhiteRanges),
  );
  const [ending, setEnding] = useState<EndingConfig>(reviewConfig?.ending ?? DEFAULT_ENDING);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [currentPreviewTime, setCurrentPreviewTime] = useState(0);
  const [draftDuration, setDraftDuration] = useState(0);
  const [activeControlTab, setActiveControlTab] = useState<"overlays" | "ending" | "effects">(
    "overlays",
  );

  useEffect(() => {
    setOverlays(normalizeOverlays(reviewConfig?.textOverlays));
    setBlackAndWhite(hasFullTimelineBlackWhite(reviewConfig?.blackWhiteRanges));
    setEnding(reviewConfig?.ending ?? DEFAULT_ENDING);
    setCurrentPreviewTime(0);
    setDraftDuration(0);
  }, [job.id, reviewConfig?.textOverlays, reviewConfig?.blackWhiteRanges, reviewConfig?.ending]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const blackWhiteRanges = useMemo<BlackWhiteRange[]>(() => {
    if (!blackAndWhite) return [];

    return [
      {
        id: "full-timeline",
        startSec: 0,
        endSec: Math.max(draftDuration || 0, 3600),
      },
    ];
  }, [blackAndWhite, draftDuration]);

  const reviewPayload = {
    textOverlays: overlays.map(toTimelineOverlayPayload),
    blackWhiteRanges,
    ending,
  };

  async function saveReview() {
    setSaving(true);
    try {
      const res = await authedJsonFetch(`${apiBaseUrl}/api/multi-source-edit/${job.id}/review`, {
        method: "POST",
        body: JSON.stringify(reviewPayload),
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
          body: JSON.stringify(reviewPayload),
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-2 backdrop-blur-md sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-[101] flex h-[96dvh] w-full max-w-[min(1760px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px] border border-slate-800/80 bg-slate-950 shadow-2xl shadow-black/70">
        <div className="shrink-0 border-b border-slate-800/80 px-4 py-3 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-50 sm:text-lg">
                Review multi-source edit before final render
              </h3>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                Preview the assembled timeline, add overlays and ending effects, then render.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-900"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6">
          <div className="grid min-h-[560px] flex-1 gap-4 xl:grid-cols-[minmax(560px,760px)_minmax(380px,1fr)] 2xl:min-h-[640px] 2xl:grid-cols-[minmax(660px,860px)_minmax(440px,1fr)]">
            <section className="min-h-0 overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/70 p-3 shadow-xl shadow-black/20">
              <ReviewVideoPreview
                clipUrl={draftUrl}
                clipIndex={0}
                drafts={[]}
                overlays={overlays}
                captionsEnabled={false}
                blackAndWhite={blackAndWhite}
                ending={ending}
                onTimeChange={setCurrentPreviewTime}
                onDurationChange={setDraftDuration}
              />
            </section>

            <aside className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/70 shadow-xl shadow-black/20">
              <div className="shrink-0 border-b border-slate-800/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Editor controls</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Same review surface as AI Shorts, adapted for one assembled timeline.
                    </div>
                  </div>

                  <div className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[10px] text-slate-300">
                    {currentPreviewTime.toFixed(2)}s
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { id: "overlays", label: "Overlays" },
                    { id: "ending", label: "Ending" },
                    { id: "effects", label: "Effects" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveControlTab(tab.id as typeof activeControlTab)}
                      className={`rounded-2xl border px-3 py-2 text-center text-[11px] font-semibold transition ${
                        activeControlTab === tab.id
                          ? "border-cyan-400 bg-cyan-400/10 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]"
                          : "border-slate-800 bg-slate-950/80 text-slate-400 hover:border-cyan-400/50 hover:text-slate-200"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {activeControlTab === "overlays" && (
                  <TextOverlayEditor overlays={overlays} clipCount={1} onChange={setOverlays} />
                )}

                {activeControlTab === "ending" && (
                  <div className="rounded-3xl border border-slate-800/80 bg-slate-900/35 p-4">
                    <div className="mb-4">
                      <div className="text-sm font-semibold text-slate-100">Ending</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Add a final freeze, fade, or end card.
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                      {(["none", "freeze", "fadeBlack", "endCard"] as EndingType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setEnding((prev) => ({ ...prev, type }))}
                          className={`rounded-2xl border p-4 text-left text-xs transition ${
                            ending.type === type
                              ? "border-cyan-400 bg-cyan-400/10 text-cyan-100"
                              : "border-slate-800 bg-slate-950/80 text-slate-300 hover:border-cyan-400/60"
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
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-medium text-slate-400">
                            Ending text
                          </label>
                          <input
                            type="text"
                            value={ending.text ?? ""}
                            onChange={(e) =>
                              setEnding((prev) => ({ ...prev, text: e.target.value }))
                            }
                            placeholder="Follow for more"
                            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
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
                            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
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
                            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-medium text-slate-400">Position</label>
                          <select
                            value={ending.position ?? "bottom"}
                            onChange={(e) =>
                              setEnding((prev) => ({
                                ...prev,
                                position: e.target.value as EndingPosition,
                              }))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
                          >
                            <option value="top">Top</option>
                            <option value="center">Center</option>
                            <option value="bottom">Bottom</option>
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
                                emojiPlacement: e.target.value as EndingEmojiPlacement,
                              }))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
                          >
                            <option value="left">Left</option>
                            <option value="right">Right</option>
                            <option value="center">Both sides</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeControlTab === "effects" && (
                  <div className="rounded-3xl border border-slate-800/80 bg-slate-900/35 p-4">
                    <div className="mb-4">
                      <div className="text-sm font-semibold text-slate-100">Effects</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Quick final render options.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setBlackAndWhite((value) => !value)}
                      className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition ${
                        blackAndWhite
                          ? "border-emerald-400 bg-emerald-400/10"
                          : "border-slate-800 bg-slate-950/80 hover:border-emerald-400/60"
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-100">Black & White</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Apply grayscale to the whole assembled edit.
                        </div>
                      </div>

                      <span
                        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
                          blackAndWhite
                            ? "border-emerald-400 bg-emerald-500/20"
                            : "border-slate-600 bg-slate-800/80"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-slate-100 shadow transition ${
                            blackAndWhite ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-800/80 px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] text-slate-500">
              Save changes before rendering. Render final uses the latest overlays, ending, and
              effects.
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={saveReview}
                disabled={saving || rendering}
                className="rounded-xl border border-sky-500/70 px-4 py-2 text-sm font-semibold text-sky-300 transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save review"}
              </button>

              <button
                type="button"
                onClick={renderFinal}
                disabled={saving || rendering || !draftUrl}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow shadow-emerald-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {rendering ? "Rendering..." : "Render final video"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
