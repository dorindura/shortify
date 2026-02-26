"use client";

import { useEffect, useState } from "react";
import type { Job } from "@lib/jobsStore";
import { formatDateTime } from "@utils/formats";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type CaptionStyle = "boldYellow" | "subtle" | "karaoke";

const API = process.env.NEXT_PUBLIC_API_BASE_URL!;

const supabase = supabaseBrowser();

async function getAuthToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authedJsonFetch(input: string, init: RequestInit = {}) {
  const token = await getAuthToken();

  const headers = new Headers(init.headers);

  const hasBody = init.body !== undefined && init.body !== null;

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}

async function authedFormFetch(input: string, init: RequestInit = {}) {
  const token = await getAuthToken();

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // DO NOT set Content-Type for FormData (browser will set boundary)
  return fetch(input, { ...init, headers });
}

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  type JobAspect = "horizontal" | "vertical" | "verticalLetterbox";
  const [aspect, setAspect] = useState<JobAspect>("horizontal");

  const [clipDurationSec, setClipDurationSec] = useState<number>(30);
  const [maxClips, setMaxClips] = useState<number>(3);
  const [captionsEnabled, setCaptionsEnabled] = useState<boolean>(true);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("karaoke");

  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [canDeleteJobs, setCanDeleteJobs] = useState(false);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  type JobGoal = "shorts" | "summary";
  const [jobGoal, setJobGoal] = useState<JobGoal>("shorts");
  const [summaryTargetSec, setSummaryTargetSec] = useState<number>(90);

  const hasActiveJobs =
    Array.isArray(jobs) && jobs.some((j) => j.status === "pending" || j.status === "processing");

  async function fetchJobs() {
    try {
      const res = await authedJsonFetch(`${API}/api/jobs`);

      if (!res.ok) {
        console.warn("Failed to fetch jobs:", res.status);
        setJobs([]);
        return;
      }

      const data = await res.json();

      if (!Array.isArray(data.jobs)) {
        console.warn("Invalid jobs payload:", data);
        setJobs([]);
        return;
      }

      setJobs(data.jobs);
      setCanDeleteJobs(!!data.canDelete);
    } catch (err) {
      console.error("fetchJobs error:", err);
      setJobs([]);
    }
  }

  // Load jobs on first render
  useEffect(() => {
    fetchJobs();
  }, []);

  // Refresh while jobs are active
  useEffect(() => {
    if (!hasActiveJobs) return;

    const intervalId = setInterval(() => {
      fetchJobs();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [hasActiveJobs]);

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await authedJsonFetch(`${API}/api/url`, {
        method: "POST",
        body: JSON.stringify({
          url,
          aspect,
          clipDurationSec,
          maxClips,
          captionsEnabled,
          captionStyle,
          jobGoal,
          summaryTargetSec: jobGoal === "summary" ? summaryTargetSec : undefined,
        }),
      });

      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        setPaywallMessage(data?.error ?? "Free limit reached. Upgrade to continue.");
        setShowUpgrade(true);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPaywallMessage(data?.error ?? "Failed to create job.");
        setShowUpgrade(false);
        return;
      }

      setPaywallMessage(null);
      setShowUpgrade(false);
      setUrl("");
      await fetchJobs();
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("aspect", aspect);
    formData.append("clipDurationSec", String(clipDurationSec));
    formData.append("maxClips", String(maxClips));
    formData.append("captionsEnabled", String(captionsEnabled));
    formData.append("captionStyle", captionStyle);

    formData.append("jobGoal", jobGoal);

    if (jobGoal === "summary") {
      formData.append("summaryTargetSec", String(summaryTargetSec));
    }

    setLoading(true);
    try {
      const res = await authedFormFetch(`${API}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        setPaywallMessage(data?.error ?? "Free limit reached. Upgrade to continue.");
        setShowUpgrade(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPaywallMessage(data?.error ?? "Upload failed.");
        setShowUpgrade(false);
        return;
      }

      setPaywallMessage(null);
      setShowUpgrade(false);
      e.target.value = "";
      await fetchJobs();
    } finally {
      setLoading(false);
    }
  }

  async function handleManageBilling() {
    setLoading(true);
    try {
      const res = await authedJsonFetch(`/api/stripe/portal`, {
        method: "POST",
      });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  const [deletingJobs, setDeletingJobs] = useState<Record<string, boolean>>({});

  async function deleteJob(jobId: string) {
    setDeletingJobs((prev) => ({ ...prev, [jobId]: true }));
    try {
      const res = await authedJsonFetch(`${API}/api/jobs/${jobId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await fetchJobs();
        return;
      }

      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "Delete failed");
    } finally {
      setDeletingJobs((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    }
  }

  async function downloadWithAuth(fileUrl: string, filename: string, key: string) {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadingKey(key);

    try {
      const res = await authedFormFetch(
        `${API}/api/download?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(
          filename,
        )}`,
      );

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        alert(msg || "Download failed");
        return;
      }

      const blob = await res.blob();

      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      console.error("downloadWithAuth error:", err);
      alert("Download failed");
    } finally {
      setIsDownloading(false);
      setDownloadingKey(null);
    }
  }

  async function startCheckout() {
    const res = await authedJsonFetch(`/api/stripe/checkout`, {
      method: "POST",
    });
    const data = await res.json();
    if (data?.url) window.location.href = data.url;
  }

  const optimizedLabel =
    aspect === "horizontal"
      ? "YouTube / desktop"
      : aspect === "vertical"
        ? "TikTok / Reels / Shorts (crop)"
        : "TikTok / Reels / Shorts (black bars)";

  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  const [role, setRole] = useState<"user" | "admin">("user");
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const { data: subscription } = await supabase
        .from("stripe_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.role === "admin") setRole("admin");

      if (subscription?.status === "active" || subscription?.status === "trialing") {
        setIsPro(true);
      }
    })();
  }, [user]);

  if (authLoading || !user) return <div className="p-6">Loading...</div>;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50">
      {/* NAVBAR */}
      <header className="border-b border-slate-800/70 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950/40">
              <img src="/brand/shortify-icon.svg" alt="Hookify" className="h-9 w-9" />
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 bg-clip-text text-lg font-semibold text-transparent">
                  Hookify
                </h1>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Auto-clipped, AI-captioned, face-tracked shorts in one click.
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-[11px] text-slate-400 sm:flex">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-3 py-1 ring-1 ring-slate-700/80">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Engine status: <span className="font-medium text-emerald-300">Online</span>
            </span>
            {isPro ? (
              <button
                onClick={handleManageBilling}
                disabled={loading}
                className="rounded-full px-3 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-200"
              >
                {loading ? "Loading..." : "Manage Plan"}
              </button>
            ) : (
              <button
                onClick={startCheckout}
                className="rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-400 ring-1 ring-sky-500/20 transition-all hover:bg-sky-500/20"
              >
                Upgrade to Pro
              </button>
            )}
            {role === "admin" && (
              <button
                onClick={() => router.push("/admin")}
                className="rounded-full border border-slate-700/90 bg-slate-900/80 px-3 py-1 text-[11px] font-medium text-slate-200 hover:border-sky-500 hover:bg-slate-900"
              >
                Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        {/* LEFT COLUMN – controls */}
        <div className="flex-1 space-y-5">
          {/* URL + upload card */}
          <section className="space-y-5 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-xl shadow-black/40 backdrop-blur-md">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-slate-50">Create new job</h2>
              <p className="text-xs text-slate-400">
                Paste a YouTube/TikTok URL or upload a video file. We&apos;ll handle the rest.
              </p>
            </div>

            {paywallMessage && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">Limit reached</div>
                    <div className="mt-0.5 text-amber-200/90">{paywallMessage}</div>
                  </div>

                  {showUpgrade && (
                    <button
                      type="button"
                      onClick={startCheckout}
                      className="shrink-0 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-semibold text-slate-950 shadow hover:brightness-110"
                    >
                      Upgrade
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* URL input */}
            <form onSubmit={handleUrlSubmit} className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <input
                  type="url"
                  placeholder="youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/90 px-10 py-2 text-sm text-slate-100 ring-1 ring-transparent transition outline-none focus:border-sky-500 focus:ring-sky-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg shadow-sky-500/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="hidden sm:inline">Generate from URL</span>
                <span className="sm:hidden">Generate</span>
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 text-[10px] tracking-[0.16em] text-slate-500 uppercase">
              <div className="h-px flex-1 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800" />
              or upload file
              <div className="h-px flex-1 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800" />
            </div>

            {/* Upload */}
            <label className="group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700/90 bg-slate-900/60 px-4 py-5 text-center text-xs text-slate-300/90 transition hover:border-sky-500 hover:bg-slate-900/80">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="rounded-full bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-sky-300">
                  Upload video
                </span>
                <span className="text-slate-400">MP4 / MOV / WebM</span>
              </div>
              <p className="max-w-xs text-[11px] text-slate-500">
                Drop a file here or click to browse from your computer.
              </p>
              <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                disabled={loading}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </section>

          {/* OUTPUT FORMAT & SETTINGS */}
          <section className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-xl shadow-black/40 backdrop-blur-md">
            {/* Aspect ratio */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-50">Output format</h2>
                <span className="text-[10px] text-slate-500">Optimized for {optimizedLabel}</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="group relative">
                  <input
                    type="radio"
                    name="aspect"
                    value="horizontal"
                    checked={aspect === "horizontal"}
                    onChange={() => setAspect("horizontal")}
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
                    checked={aspect === "vertical"}
                    onChange={() => setAspect("vertical")}
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
                    checked={aspect === "verticalLetterbox"}
                    onChange={() => setAspect("verticalLetterbox")}
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
                      {/* Phone preview with bars */}
                      <div className="flex h-10 w-6 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
                        {/* top bar */}
                        <div className="flex h-full w-full flex-col">
                          <div className="h-2 bg-slate-950" />
                          <div className="flex-1 bg-slate-800" />
                          <div className="h-2 bg-slate-950" />
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400">
                        Full video visible — padded to 9:16 with black bars.
                      </p>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Job goal */}
            <div className="mt-4 border-t border-slate-800/80 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-50">Goal</h2>
                <span className="text-[10px] text-slate-500">
                  {jobGoal === "summary" ? `Summary ~${summaryTargetSec}s` : "Multiple shorts"}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setJobGoal("shorts")}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                    jobGoal === "shorts"
                      ? "border-sky-500 bg-slate-900/80 text-slate-50"
                      : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-sky-500/60"
                  }`}
                >
                  <div className="font-semibold">AI Shorts</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Generate multiple clips (maxClips) at your chosen duration.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setJobGoal("summary")}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                    jobGoal === "summary"
                      ? "border-emerald-500 bg-slate-900/80 text-slate-50"
                      : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-emerald-500/60"
                  }`}
                >
                  <div className="font-semibold">AI Story Summary (Pro)</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    One highlight reel around a target length.
                  </div>
                </button>
              </div>

              {/* Summary length controls */}
              <div className={`mt-4 ${jobGoal !== "summary" ? "hidden" : ""}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-200">Summary length</h3>
                  <span className="text-[10px] text-slate-500">Target: ~{summaryTargetSec}s</span>
                </div>

                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {[45, 60, 90, 120, 180].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSummaryTargetSec(val)}
                      className={`min-w-15 rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        summaryTargetSec === val
                          ? "bg-emerald-500 text-slate-950 shadow shadow-emerald-500/40"
                          : "bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {val}s
                    </button>
                  ))}
                </div>

                <input
                  type="range"
                  min={30}
                  max={300}
                  step={5}
                  value={summaryTargetSec}
                  onChange={(e) => setSummaryTargetSec(Number(e.target.value))}
                  className="mt-3 w-full accent-emerald-400"
                />

                {/* Optional helper for free users if you want */}
                {!isPro && summaryTargetSec > 60 && (
                  <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    Free plan allows summary up to 60s. Choose 60s or upgrade to Pro.
                  </div>
                )}
              </div>
            </div>

            {/* Clip settings */}
            <div
              className={`mt-4 grid gap-4 border-t border-slate-800/80 pt-4 md:grid-cols-2 ${
                jobGoal === "summary" ? "pointer-events-none opacity-40" : ""
              }`}
            >
              {/* Clip length */}
              <div className="space-y-2 md:border-r md:border-slate-800/80 md:pr-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-200">Clip length</h3>
                  <span className="text-[10px] text-slate-500">~{clipDurationSec}s per short</span>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {[20, 30, 45, 60, 90].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setClipDurationSec(val)}
                      className={`min-w-15 rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        clipDurationSec === val
                          ? "bg-sky-500 text-slate-950 shadow shadow-sky-500/40"
                          : "bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {val}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Max clips */}
              <div className="space-y-2 md:pl-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-200">Max clips per video</h3>
                  <span className="text-[10px] text-slate-500">Up to {maxClips} shorts</span>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMaxClips(val)}
                      className={`min-w-15 rounded-full px-3 py-1 text-[11px] font-medium transition ${
                        maxClips === val
                          ? "bg-emerald-500 text-slate-950 shadow shadow-emerald-500/40"
                          : "bg-slate-900/80 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {val} clip{val > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Captions */}
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
                  <span
                    className={`pointer-events-none absolute inset-0 rounded-xl ring-1 ring-sky-500/0 transition peer-checked:ring-sky-500/80`}
                  />
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
          </section>
        </div>

        {/* RIGHT COLUMN – jobs */}
        <aside className="mt-1 w-full lg:mt-0 lg:w-[440px]">
          <section className="sticky top-20 space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/40 backdrop-blur-md">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-50">Jobs timeline</h2>
                <p className="text-[11px] text-slate-500">
                  Track downloads, clipping, face analysis & rendering.
                </p>
              </div>
              <button
                onClick={fetchJobs}
                className="inline-flex items-center justify-center rounded-full border border-slate-700/90 bg-slate-900/80 px-3 py-1 text-[11px] font-medium text-slate-200 transition hover:border-sky-500 hover:bg-slate-900"
              >
                Refresh
              </button>
            </div>

            <div className="max-h-[460px] space-y-2 overflow-auto text-sm">
              {jobs.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-800/80 bg-slate-950/80 px-3 py-4 text-[12px] text-slate-400">
                  No jobs yet. Paste a URL or upload a file to generate your first face-aware
                  shorts.
                </p>
              )}

              {jobs.map((job) => {
                const isPending = job.status === "pending";
                const isProcessing = job.status === "processing";
                const isDone = job.status === "done";
                const isFailed = job.status === "failed";

                return (
                  <div
                    key={job.id}
                    className="rounded-xl border border-slate-800/90 bg-slate-950/90 p-3 text-xs shadow-sm shadow-black/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-300">
                            {job.id.slice(0, 8)}…
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isPending
                                ? "bg-amber-500/10 text-amber-400"
                                : isProcessing
                                  ? "bg-sky-500/10 text-sky-400"
                                  : isDone
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-rose-500/10 text-rose-400"
                            }`}
                          >
                            {isPending && "⏳ PENDING"}
                            {isProcessing && "⚙️ PROCESSING"}
                            {isDone && "✅ DONE"}
                            {isFailed && "⚠️ FAILED"}
                            {!isPending &&
                              !isProcessing &&
                              !isDone &&
                              !isFailed &&
                              job.status.toUpperCase()}
                          </span>
                          {canDeleteJobs && (isDone || isFailed) && (
                            <button
                              onClick={() => deleteJob(job.id)}
                              disabled={!!deletingJobs[job.id]}
                              className="rounded-full border border-rose-500/60 px-2.5 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingJobs[job.id] ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                          <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5 tracking-[0.14em] uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                            {job.type}
                          </span>
                          <span className="text-[10px] break-all text-slate-500">{job.source}</span>
                        </div>

                        <div className="mt-1 text-[10px] text-slate-500">
                          Created: {formatDateTime(job.createdAt)}
                        </div>
                      </div>
                    </div>

                    {/* Job options */}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                      {job.jobGoal && (
                        <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
                          Goal: {job.jobGoal === "summary" ? "Summary" : "Shorts"}
                          {job.jobGoal === "summary" && job.summaryTargetSec
                            ? ` (~${job.summaryTargetSec}s)`
                            : ""}
                        </span>
                      )}

                      {job.aspect && (
                        <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
                          <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
                            {job.aspect === "vertical"
                              ? "Vertical 9:16 (Crop)"
                              : job.aspect === "verticalLetterbox"
                                ? "Vertical 9:16 (Bars)"
                                : "Horizontal 16:9"}
                          </span>
                        </span>
                      )}
                      {job.clipDurationSec && job.jobGoal !== "summary" && (
                        <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
                          ~{job.clipDurationSec}s clips
                        </span>
                      )}
                      {job.maxClips && job.jobGoal !== "summary" && (
                        <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
                          up to {job.maxClips} clips
                        </span>
                      )}
                      {job.captionsEnabled !== undefined && (
                        <span className="rounded-full bg-slate-900/80 px-2 py-0.5">
                          {job.captionsEnabled ? "Captions: ON" : "Captions: OFF"}
                          {job.captionsEnabled && job.captionStyle
                            ? ` (${job.captionStyle})`
                            : null}
                        </span>
                      )}
                    </div>

                    {/* Stage + progress */}
                    {job.stage && (
                      <div className="mt-2 text-[10px] text-slate-400">
                        Stage:{" "}
                        <span className="font-semibold text-slate-200">
                          {job.stage.toUpperCase()}
                        </span>
                        {typeof job.progress === "number" && (
                          <span className="ml-1 text-slate-500">({job.progress}%)</span>
                        )}
                      </div>
                    )}

                    {typeof job.progress === "number" && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-900">
                        <div
                          className={`h-1.5 rounded-full transition-[width] duration-300 ${
                            isFailed ? "bg-rose-500" : isDone ? "bg-emerald-500" : "bg-sky-500"
                          }`}
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Captioned clips */}
                    {job.captionedClips && job.captionedClips.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Captioned shorts</span>
                          <span className="text-[10px] text-slate-500">
                            {job.captionedClips.length} file
                            {job.captionedClips.length > 1 ? "s" : ""}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          {job.captionedClips.map((url, idx) => {
                            const thumb = job.captionedThumbs?.[idx];
                            const title = `Short ${idx + 1}`;

                            const key = `${job.id}:${idx}`;
                            const isThisDownloading = isDownloading && downloadingKey === key;

                            return (
                              <div
                                key={url}
                                className="flex gap-2 rounded-lg border border-slate-800 bg-slate-950/90 p-2"
                              >
                                {thumb && (
                                  <div className="relative h-20 w-12 overflow-hidden rounded-md border border-slate-800/80 bg-slate-900/90">
                                    <img
                                      src={thumb}
                                      alt={title}
                                      className="h-full w-full object-cover"
                                    />
                                    {(aspect === "vertical" || aspect === "verticalLetterbox") && (
                                      <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-slate-950/80 px-1.5 py-0.5 text-[8px] text-slate-200">
                                        9:16
                                      </span>
                                    )}
                                  </div>
                                )}

                                <div className="flex flex-1 flex-col justify-between text-[11px]">
                                  <div className="font-medium text-slate-100">{title}</div>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    <button
                                      onClick={() =>
                                        downloadWithAuth(url, `short-${idx + 1}.mp4`, key)
                                      }
                                      disabled={isDownloading}
                                      className="rounded-full border bg-sky-500 px-2.5 py-1 text-[10px] font-semibold text-slate-950 shadow-sm shadow-sky-500/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {isThisDownloading ? "Downloading..." : "Download"}
                                    </button>
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-full border border-sky-500/80 px-2.5 py-1 text-[10px] font-semibold text-sky-300 transition hover:bg-sky-500/10"
                                    >
                                      Preview
                                    </a>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
