"use client";

import { useEffect, useMemo, useState } from "react";

type QuoteReelReviewJob = {
  id: string;
  quoteReelMeta?: {
    finalScript?: string;
    originalFinalScript?: string;
    scriptEdited?: boolean;
    tone?: string;
    mode?: string;
    targetDurationSec?: number;
  };
};

type Props = {
  job: QuoteReelReviewJob;
  apiBaseUrl: string;
  authedJsonFetch: (input: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
  onRendered?: () => Promise<void> | void;
};

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export default function QuoteReelScriptReviewPanel({
  job,
  apiBaseUrl,
  authedJsonFetch,
  onClose,
  onSaved,
  onRendered,
}: Props) {
  const initialScript = job.quoteReelMeta?.finalScript ?? "";
  const [script, setScript] = useState(initialScript);
  const [saving, setSaving] = useState(false);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    setScript(job.quoteReelMeta?.finalScript ?? "");
  }, [job.id, job.quoteReelMeta?.finalScript]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const wordCount = useMemo(() => countWords(script), [script]);
  const hasChanges = script.trim() !== initialScript.trim();
  const isValid = script.trim().length >= 20 && script.trim().length <= 12000;

  async function submit(continueRender: boolean) {
    if (!isValid) {
      alert("Please keep the script between 20 and 12,000 characters.");
      return;
    }

    if (continueRender) {
      setContinuing(true);
    } else {
      setSaving(true);
    }

    try {
      const res = await authedJsonFetch(`${apiBaseUrl}/api/quote-reel/${job.id}/script`, {
        method: "POST",
        body: JSON.stringify({
          finalScript: script,
          continueRender,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data?.error ?? "Failed to update script");
        return;
      }

      if (continueRender) {
        await onRendered?.();
        onClose();
        return;
      }

      await onSaved?.();
      alert("Script saved");
    } finally {
      setSaving(false);
      setContinuing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-md sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-[101] flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-slate-800/80 bg-slate-950 shadow-2xl shadow-black/70">
        <div className="shrink-0 border-b border-slate-800/80 px-4 py-3 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-50 sm:text-lg">
                Edit Quote Reel script
              </h3>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                Voiceover, captions, and scene picks will be generated from this version.
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

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            {job.quoteReelMeta?.mode && (
              <span className="rounded-full bg-slate-900 px-2 py-1">
                {job.quoteReelMeta.mode === "manual_text" ? "Manual text" : "AI prompt"}
              </span>
            )}
            {job.quoteReelMeta?.tone && (
              <span className="rounded-full bg-slate-900 px-2 py-1">
                Tone: {job.quoteReelMeta.tone}
              </span>
            )}
            {job.quoteReelMeta?.targetDurationSec && (
              <span className="rounded-full bg-slate-900 px-2 py-1">
                Target: ~{Math.round(job.quoteReelMeta.targetDurationSec)}s
              </span>
            )}
            <span className="rounded-full bg-slate-900 px-2 py-1">{wordCount} words</span>
            {hasChanges && (
              <span className="rounded-full bg-fuchsia-500/10 px-2 py-1 text-fuchsia-200">
                Unsaved edits
              </span>
            )}
          </div>

          <textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            className="min-h-0 flex-1 resize-none rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-fuchsia-500/70 focus:ring-2 focus:ring-fuchsia-500/10"
            placeholder="Your Quote Reel script..."
          />

          <div className="flex flex-col gap-3 border-t border-slate-800/80 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Saving keeps the job here. Continue starts voiceover, scene selection, and final
              render.
            </p>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={saving || continuing || !isValid}
                className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Script"}
              </button>
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={saving || continuing || !isValid}
                className="rounded-full border border-fuchsia-400/80 bg-fuchsia-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {continuing ? "Starting render..." : "Continue to Render"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
