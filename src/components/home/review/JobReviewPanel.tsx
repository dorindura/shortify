"use client";

import { useEffect, useMemo, useState } from "react";
import CaptionDraftEditor from "./CaptionDraftEditor";
import TextOverlayEditor from "./TextOverlayEditor";
import ReviewVideoPreview from "./ReviewVideoPreview";
import { OVERLAY_EMOJIS } from "@lib/overlayEmojis";

type CaptionStyle = "boldYellow" | "subtle" | "karaoke";
type TextOverlayPosition = "top" | "center" | "bottom";

type CaptionDraftWord = {
  text: string;
  startSec: number;
  endSec: number;
};

type CaptionDraftChunk = {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  words?: CaptionDraftWord[];
};

type CaptionDraftClip = {
  clipIndex: number;
  chunks: CaptionDraftChunk[];
};

type TextOverlay = {
  id: string;
  clipIndex: number;
  text: string;
  startSec: number;
  endSec: number;
  position: TextOverlayPosition;
  emoji?: string | null;
  emojiPlacement?: "left" | "right";
};

type EndingType = "none" | "freeze" | "fadeBlack" | "endCard";

type EndingPosition = "top" | "center" | "bottom";
type EndingEmojiPlacement = "left" | "right" | "center";

type EndingConfig = {
  type: EndingType;
  text?: string;
  subtext?: string;
  emoji?: string;
  emojiPlacement?: EndingEmojiPlacement;
  position?: EndingPosition;
  durationSec?: number;
};

const DEFAULT_ENDING: EndingConfig = {
  type: "none",
  durationSec: 1.2,
  emojiPlacement: "right",
  position: "bottom",
};

type ReviewJob = {
  id: string;
  clips?: string[];
  previewClips?: string[];
  captionDrafts?: CaptionDraftClip[];
  textOverlays?: TextOverlay[];
  captionStyle?: CaptionStyle;
  captionsEnabled?: boolean;
  blackAndWhite?: boolean;
  ending?: EndingConfig;
};

type Props = {
  job: ReviewJob;
  apiBaseUrl: string;
  authedJsonFetch: (input: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
  onRendered?: () => Promise<void> | void;
};

export default function JobReviewPanel({
  job,
  apiBaseUrl,
  authedJsonFetch,
  onClose,
  onSaved,
  onRendered,
}: Props) {
  const [drafts, setDrafts] = useState<CaptionDraftClip[]>(job.captionDrafts ?? []);
  const [overlays, setOverlays] = useState<TextOverlay[]>(job.textOverlays ?? []);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(job.captionStyle ?? "karaoke");
  const [captionsEnabled, setCaptionsEnabled] = useState<boolean>(job.captionsEnabled ?? true);
  const [blackAndWhite, setBlackAndWhite] = useState<boolean>(job.blackAndWhite ?? false);
  const [ending, setEnding] = useState<EndingConfig>(job.ending ?? DEFAULT_ENDING);

  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);

  const [selectedClipIndex, setSelectedClipIndex] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);

  useEffect(() => {
    setDrafts(job.captionDrafts ?? []);
    setOverlays(job.textOverlays ?? []);
    setCaptionStyle(job.captionStyle ?? "karaoke");
    setCaptionsEnabled(job.captionsEnabled ?? true);
    setBlackAndWhite(job.blackAndWhite ?? false);
    setEnding(job.ending ?? DEFAULT_ENDING);
    setSelectedClipIndex(0);
  }, [job]);

  useEffect(() => {
    setSeekTo(null);
  }, [selectedClipIndex]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const clipCount = useMemo(
    () => Math.max(job.clips?.length ?? 0, drafts.length, 1),
    [job.clips, drafts.length],
  );

  const [selectedClipUrl, setSelectedClipUrl] = useState<string | null>(null);

  useEffect(() => {
    let revokedUrl: string | null = null;

    async function loadClipPreview() {
      setSelectedClipUrl(null);

      if (!job.id) return;
      if (selectedClipIndex < 0) return;

      try {
        const res = await authedJsonFetch(
          `${apiBaseUrl}/api/jobs/${job.id}/clips/${selectedClipIndex}/preview`,
        );

        if (!res.ok) {
          console.error("Failed to load clip preview");
          return;
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        revokedUrl = objectUrl;
        setSelectedClipUrl(objectUrl);
      } catch (err) {
        console.error("loadClipPreview error:", err);
      }
    }

    loadClipPreview();

    return () => {
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [job.id, selectedClipIndex, apiBaseUrl, authedJsonFetch]);

  async function saveReview() {
    setSaving(true);
    try {
      const res = await authedJsonFetch(`${apiBaseUrl}/api/jobs/${job.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          captionDrafts: drafts,
          textOverlays: overlays,
          captionStyle,
          captionsEnabled,
          blackAndWhite,
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
      const saveRes = await authedJsonFetch(`${apiBaseUrl}/api/jobs/${job.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          captionDrafts: drafts,
          textOverlays: overlays,
          captionStyle,
          captionsEnabled,
          blackAndWhite,
          ending,
        }),
      });

      const saveData = await saveRes.json().catch(() => ({}));

      if (!saveRes.ok) {
        alert(saveData?.error ?? "Failed to save review");
        return;
      }

      const renderRes = await authedJsonFetch(`${apiBaseUrl}/api/jobs/${job.id}/render`, {
        method: "POST",
      });

      const renderData = await renderRes.json().catch(() => ({}));

      if (!renderRes.ok) {
        alert(renderData?.error ?? "Failed to render reviewed job");
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
              Review shorts before final render
            </h3>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              Edit captions, preview them live, add overlays, then render the final version.
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
              <ReviewVideoPreview
                clipUrl={selectedClipUrl}
                clipIndex={selectedClipIndex}
                drafts={drafts}
                overlays={overlays}
                captionsEnabled={captionsEnabled}
                blackAndWhite={blackAndWhite}
                ending={ending}
                seekTo={seekTo}
                onSeekHandled={() => setSeekTo(null)}
              />

              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-semibold text-slate-100">Caption settings</div>

                  <label className="inline-flex cursor-pointer items-center gap-2 text-[11px]">
                    <span className="text-slate-400">Captions enabled</span>
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

                <div className="grid gap-2 md:grid-cols-3">
                  {(["karaoke", "boldYellow", "subtle"] as CaptionStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setCaptionStyle(style)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                        captionStyle === style
                          ? "border-sky-500 bg-slate-900/80 text-slate-50"
                          : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-sky-500/60"
                      }`}
                    >
                      <div className="font-semibold">{style}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-100">Ending</div>

                <div className="grid gap-2 md:grid-cols-2">
                  {(["none", "freeze", "fadeBlack", "endCard"] as EndingType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setEnding((prev) => ({
                          ...prev,
                          type,
                        }))
                      }
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
                        onChange={(e) =>
                          setEnding((prev) => ({
                            ...prev,
                            text: e.target.value,
                          }))
                        }
                        placeholder="Follow for more"
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>

                    {/*<div>*/}
                    {/*  <label className="text-[10px] font-medium text-slate-400">Subtext</label>*/}
                    {/*  <input*/}
                    {/*    type="text"*/}
                    {/*    value={ending.subtext ?? ""}*/}
                    {/*    onChange={(e) =>*/}
                    {/*      setEnding((prev) => ({*/}
                    {/*        ...prev,*/}
                    {/*        subtext: e.target.value,*/}
                    {/*      }))*/}
                    {/*    }*/}
                    {/*    placeholder="@hookify.app"*/}
                    {/*    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"*/}
                    {/*  />*/}
                    {/*</div>*/}

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
              <CaptionDraftEditor
                drafts={drafts}
                selectedClipIndex={selectedClipIndex}
                onSelectClip={setSelectedClipIndex}
                onSeekToChunk={(time) => setSeekTo(time)}
                onChange={setDrafts}
              />

              <TextOverlayEditor overlays={overlays} clipCount={clipCount} onChange={setOverlays} />

              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-[11px]">
                <span className="text-slate-400">Black & White</span>
                <button
                  type="button"
                  onClick={() => setBlackAndWhite((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full border transition ${
                    blackAndWhite
                      ? "border-emerald-400 bg-emerald-500/20"
                      : "border-slate-600 bg-slate-800/80"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-slate-100 shadow transition ${
                      blackAndWhite ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </label>
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
              {rendering ? "Rendering..." : "Render final shorts"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
