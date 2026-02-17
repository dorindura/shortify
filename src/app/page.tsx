"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <header className="border-b border-slate-800/70 bg-slate-950/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950/40">
                <img
                    src="/brand/shortify-icon.svg"
                    alt="Hookify"
                    className="h-9 w-9"
                />
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h1 className="bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 bg-clip-text text-lg font-semibold text-transparent">
                    Hookify
                  </h1>
                  <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-medium text-slate-300/90 ring-1 ring-slate-700/80">
                  v0.1 • Face-Aware Engine
                </span>
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
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-xs text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Hookify • beta
          </div>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Turn any video into shorts in one click.
          </h1>

          <p className="mt-4 max-w-2xl text-slate-300">
            Auto-clipped, AI-captioned, face-tracked shorts. Upload a video or paste a link.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
                href="/register"
                className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-3 font-semibold text-slate-950"
            >
              Create account
            </Link>

            <Link
                href="/login"
                className="rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-3 font-semibold text-slate-100"
            >
              Login
            </Link>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Feature title="Face-aware smart crop" desc="Keeps the speaker centered in vertical shorts." />
            <Feature title="Caption styles" desc="Karaoke, bold, subtle — ready for social." />
            <Feature title="Jobs timeline" desc="Track progress from download → render → export." />
          </div>
        </div>
      </main>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1 text-sm text-slate-300">{desc}</div>
      </div>
  );
}
