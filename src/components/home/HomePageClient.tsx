"use client";

import { useEffect, useState } from "react";
import type { Job } from "@lib/jobsStore";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import CreateJobPanel from "./CreateJobPanel";
import JobsTimelinePanel from "./JobsTimelinePanel";
import type {
  CustomRange,
  LocalCaptionStyle,
  LocalJobAspect,
  LocalJobGoal,
  LocalQuoteTone,
  LocalShortsSelectionMode,
  MultiSourceInput,
  MultiSourceSegmentDraft,
} from "./home.types";
import { buildCustomRangesPayload, buildMultiSourceSegmentsPayload } from "./home.utils";
import JobReviewPanel from "@/components/home/review/JobReviewPanel";
import MultiSourceReviewPanel from "@/components/home/review/MultiSourceReviewPanel";

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
  return fetch(input, { ...init, headers });
}

export default function HomePageClient() {
  const [url, setUrl] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const [aspect, setAspect] = useState<LocalJobAspect>("horizontal");
  const [clipDurationSec, setClipDurationSec] = useState<number>(30);
  const [maxClips, setMaxClips] = useState<number>(3);
  const [captionsEnabled, setCaptionsEnabled] = useState<boolean>(true);
  const [captionStyle, setCaptionStyle] = useState<LocalCaptionStyle>("karaoke");

  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [canDeleteJobs, setCanDeleteJobs] = useState(false);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const [jobGoal, setJobGoal] = useState<LocalJobGoal>("shorts");
  const [summaryTargetSec, setSummaryTargetSec] = useState<number>(90);

  const [quotePrompt, setQuotePrompt] = useState("");
  const [quoteTone, setQuoteTone] = useState<LocalQuoteTone>("cinematic");

  const [selectionMode, setSelectionMode] = useState<LocalShortsSelectionMode>("auto");
  const [customRanges, setCustomRanges] = useState<CustomRange[]>([
    { id: crypto.randomUUID(), startSec: "", endSec: "" },
  ]);

  const [multiSourceInputs, setMultiSourceInputs] = useState<MultiSourceInput[]>([
    { id: crypto.randomUUID(), url: "" },
  ]);

  const [multiSourceSegments, setMultiSourceSegments] = useState<MultiSourceSegmentDraft[]>([]);

  const isQuoteReel = jobGoal === "quote_reel";
  const isMultiSourceEdit = jobGoal === "multi_source_edit";

  const hasActiveJobs =
    Array.isArray(jobs) && jobs.some((j) => j.status === "pending" || j.status === "processing");

  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [role, setRole] = useState<"user" | "admin">("user");
  const [isPro, setIsPro] = useState(false);
  const [deletingJobs, setDeletingJobs] = useState<Record<string, boolean>>({});
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);

  const optimizedLabel = isQuoteReel
    ? "Instagram Reels / TikTok / Shorts"
    : aspect === "horizontal"
      ? "YouTube / desktop"
      : aspect === "vertical"
        ? "TikTok / Reels / Shorts (crop)"
        : "TikTok / Reels / Shorts (black bars)";

  const validCustomRangesCount = buildCustomRangesPayload(customRanges).length;
  const validMultiSourceSegmentsCount = buildMultiSourceSegmentsPayload(
    multiSourceInputs,
    multiSourceSegments,
  ).length;

  const reviewJob = jobs.find((job) => job.id === reviewJobId) ?? null;

  function addCustomRange() {
    setCustomRanges((prev) => [...prev, { id: crypto.randomUUID(), startSec: "", endSec: "" }]);
  }

  function updateCustomRange(id: string, field: "startSec" | "endSec", value: string) {
    setCustomRanges((prev) =>
      prev.map((range) => (range.id === id ? { ...range, [field]: value } : range)),
    );
  }

  function removeCustomRange(id: string) {
    setCustomRanges((prev) => {
      const next = prev.filter((range) => range.id !== id);
      return next.length ? next : [{ id: crypto.randomUUID(), startSec: "", endSec: "" }];
    });
  }

  function addMultiSourceInput() {
    setMultiSourceInputs((prev) => {
      if (prev.length >= 5) return prev;
      return [...prev, { id: crypto.randomUUID(), url: "" }];
    });
  }

  function removeMultiSourceInput(id: string) {
    setMultiSourceInputs((prev) => {
      const next = prev.filter((item) => item.id !== id);
      return next.length ? next : [{ id: crypto.randomUUID(), url: "" }];
    });

    setMultiSourceSegments((prev) => prev.filter((segment) => segment.sourceId !== id));
  }

  function changeMultiSourceUrl(id: string, value: string) {
    setMultiSourceInputs((prev) =>
      prev.map((item) => (item.id === id ? { ...item, url: value } : item)),
    );
  }

  function addMultiSourceSegment(sourceId: string) {
    setMultiSourceSegments((prev) => {
      const nextOrder = prev.length;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          sourceId,
          startSec: "",
          endSec: "",
          order: nextOrder,
        },
      ];
    });
  }

  function removeMultiSourceSegment(id: string) {
    setMultiSourceSegments((prev) =>
      prev
        .filter((segment) => segment.id !== id)
        .map((segment, index) => ({
          ...segment,
          order: index,
        })),
    );
  }

  function changeMultiSourceSegment(id: string, field: "startSec" | "endSec", value: string) {
    setMultiSourceSegments((prev) =>
      prev.map((segment) => (segment.id === id ? { ...segment, [field]: value } : segment)),
    );
  }

  function resetMultiSourceEditState() {
    setMultiSourceInputs([{ id: crypto.randomUUID(), url: "" }]);
    setMultiSourceSegments([]);
  }

  function openReview(job: Job) {
    setReviewJobId(job.id);
  }

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

  async function createQuoteReelJob() {
    if (!quotePrompt.trim()) return;

    setLoading(true);
    try {
      const res = await authedJsonFetch(`${API}/api/quote-reel`, {
        method: "POST",
        body: JSON.stringify({
          prompt: quotePrompt,
          tone: quoteTone,
          captionsEnabled,
          captionStyle,
        }),
      });

      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        setPaywallMessage(data?.error ?? "Pro only. Upgrade to continue.");
        setShowUpgrade(true);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPaywallMessage(data?.error ?? "Failed to create Quote Reel.");
        setShowUpgrade(false);
        return;
      }

      setPaywallMessage(null);
      setShowUpgrade(false);
      setQuotePrompt("");
      await fetchJobs();
    } finally {
      setLoading(false);
    }
  }

  async function createMultiSourceEditJob() {
    const segments = buildMultiSourceSegmentsPayload(multiSourceInputs, multiSourceSegments);

    if (!segments.length) {
      alert("Please add at least one valid multi-source segment.");
      return;
    }

    setLoading(true);
    try {
      const res = await authedJsonFetch(`${API}/api/multi-source-edit`, {
        method: "POST",
        body: JSON.stringify({
          aspect,
          segments,
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
        setPaywallMessage(data?.error ?? "Failed to create multi-source edit.");
        setShowUpgrade(false);
        return;
      }

      setPaywallMessage(null);
      setShowUpgrade(false);
      resetMultiSourceEditState();
      await fetchJobs();
    } finally {
      setLoading(false);
    }
  }

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (jobGoal === "quote_reel") {
      await createQuoteReelJob();
      return;
    }

    if (jobGoal === "multi_source_edit") {
      await createMultiSourceEditJob();
      return;
    }

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
          selectionMode,
          customRanges: selectionMode === "custom" ? buildCustomRangesPayload(customRanges) : [],
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
    formData.append("selectionMode", selectionMode);

    if (selectionMode === "custom") {
      formData.append("customRanges", JSON.stringify(buildCustomRangesPayload(customRanges)));
    }

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

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (!hasActiveJobs) return;

    const intervalId = setInterval(
      () => {
        fetchJobs();
      },
      isQuoteReel ? 3000 : 15000,
    );

    return () => clearInterval(intervalId);
  }, [hasActiveJobs, isQuoteReel]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

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

  useEffect(() => {
    if (!isQuoteReel) return;
    setAspect("vertical");
    setMaxClips(1);
    setUrl("");
    setSelectionMode("auto");
  }, [isQuoteReel]);

  useEffect(() => {
    if (!isMultiSourceEdit) return;
    setUrl("");
    setSelectionMode("auto");
  }, [isMultiSourceEdit]);

  if (authLoading || !user) return <div className="p-6">Loading...</div>;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50">
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
                Auto-clipped shorts, AI summaries, quote reels, and manual timeline edits in one
                place.
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

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <div className="flex-1 space-y-5">
          <CreateJobPanel
            loading={loading}
            url={url}
            setUrl={setUrl}
            paywallMessage={paywallMessage}
            showUpgrade={showUpgrade}
            startCheckout={startCheckout}
            handleUrlSubmit={handleUrlSubmit}
            handleFileChange={handleFileChange}
            isQuoteReel={isQuoteReel}
            aspect={aspect}
            setAspect={setAspect}
            optimizedLabel={optimizedLabel}
            jobGoal={jobGoal}
            setJobGoal={setJobGoal}
            summaryTargetSec={summaryTargetSec}
            setSummaryTargetSec={setSummaryTargetSec}
            isPro={isPro}
            selectionMode={selectionMode}
            setSelectionMode={setSelectionMode}
            customRanges={customRanges}
            onAddRange={addCustomRange}
            onRemoveRange={removeCustomRange}
            onChangeRange={updateCustomRange}
            validCustomRangesCount={validCustomRangesCount}
            clipDurationSec={clipDurationSec}
            setClipDurationSec={setClipDurationSec}
            maxClips={maxClips}
            setMaxClips={setMaxClips}
            quotePrompt={quotePrompt}
            setQuotePrompt={setQuotePrompt}
            quoteTone={quoteTone}
            setQuoteTone={setQuoteTone}
            createQuoteReelJob={createQuoteReelJob}
            captionsEnabled={captionsEnabled}
            setCaptionsEnabled={setCaptionsEnabled}
            captionStyle={captionStyle}
            setCaptionStyle={setCaptionStyle}
            isMultiSourceEdit={isMultiSourceEdit}
            multiSourceInputs={multiSourceInputs}
            multiSourceSegments={multiSourceSegments}
            onAddMultiSourceInput={addMultiSourceInput}
            onRemoveMultiSourceInput={removeMultiSourceInput}
            onChangeMultiSourceUrl={changeMultiSourceUrl}
            onAddMultiSourceSegment={addMultiSourceSegment}
            onRemoveMultiSourceSegment={removeMultiSourceSegment}
            onChangeMultiSourceSegment={changeMultiSourceSegment}
            validMultiSourceSegmentsCount={validMultiSourceSegmentsCount}
            createMultiSourceEditJob={createMultiSourceEditJob}
          />
        </div>

        <JobsTimelinePanel
          jobs={jobs}
          canDeleteJobs={canDeleteJobs}
          deletingJobs={deletingJobs}
          isDownloading={isDownloading}
          downloadingKey={downloadingKey}
          onRefresh={fetchJobs}
          onDeleteJob={deleteJob}
          onDownload={downloadWithAuth}
          openReview={openReview}
        />
      </div>

      {reviewJob && reviewJob.jobGoal === "shorts" && reviewJob.reviewReady && (
        <JobReviewPanel
          job={reviewJob}
          apiBaseUrl={API}
          authedJsonFetch={authedJsonFetch}
          onClose={() => setReviewJobId(null)}
          onSaved={fetchJobs}
          onRendered={fetchJobs}
        />
      )}

      {reviewJob && reviewJob.jobGoal === "multi_source_edit" && reviewJob.reviewReady && (
        <MultiSourceReviewPanel
          job={reviewJob as any}
          apiBaseUrl={API}
          authedJsonFetch={authedJsonFetch}
          onClose={() => setReviewJobId(null)}
          onSaved={fetchJobs}
          onRendered={fetchJobs}
        />
      )}
    </main>
  );
}
