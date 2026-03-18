"use client";

import { useEffect, useMemo, useState } from "react";
import CaptionDraftEditor from "./CaptionDraftEditor";
import TextOverlayEditor from "./TextOverlayEditor";

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
};

type ReviewJob = {
  id: string;
  captionDrafts?: CaptionDraftClip[];
  textOverlays?: TextOverlay[];
  captionStyle?: CaptionStyle;
  captionsEnabled?: boolean;
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

  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    setDrafts(job.captionDrafts ?? []);
    setOverlays(job.textOverlays ?? []);
    setCaptionStyle(job.captionStyle ?? "karaoke");
    setCaptionsEnabled(job.captionsEnabled ?? true);
  }, [job]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const clipCount = useMemo(() => drafts.length, [drafts]);

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

      <div className="relative z-[101] flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 px-4 py-4 sm:px-6">
          <div>
            <h3 className="text-base font-semibold text-slate-50 sm:text-lg">
              Review shorts before final render
            </h3>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              Edit captions, add overlays, then render the final version.
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
          <div className="space-y-5">
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

            <CaptionDraftEditor drafts={drafts} onChange={setDrafts} />

            <TextOverlayEditor overlays={overlays} clipCount={clipCount} onChange={setOverlays} />
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