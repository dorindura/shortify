"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { CheckIcon, SparklesIcon, ZapIcon } from "lucide-react";
import { useEffect } from "react";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 selection:bg-sky-500/30">
      {/* HEADER */}
      <header className="fixed top-0 z-50 w-full border-b border-slate-800/70 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <img src="/brand/shortify-icon.svg" alt="Hookify" className="h-9 w-9" />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="bg-gradient-to-r from-sky-400 to-emerald-300 bg-clip-text text-lg font-semibold text-transparent">
                  Hookify
                </h1>
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-xs font-medium text-slate-400 transition-colors hover:text-white"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-950 transition-all hover:bg-slate-200"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-4 py-2 text-xs font-medium text-sky-400">
            <SparklesIcon className="h-3 w-3" />
            AI-Powered Video Repurposing
          </div>
          <h1 className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent sm:text-7xl">
            Your Long Content, <br />
            Now in <span className="text-sky-400">Viral Shorts.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Hookify uses a proprietary <b>Face-Aware Engine</b> to automatically clip, crop, and
            caption your videos. Perfect for creators, podcasters, and marketers.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/register"
              className="group relative flex items-center gap-2 rounded-2xl bg-sky-500 px-8 py-4 font-bold text-slate-950 shadow-[0_0_20px_rgba(14,165,233,0.3)] transition-all hover:bg-sky-400"
            >
              Start Creating Now
              <ZapIcon className="h-4 w-4 fill-current" />
            </Link>
          </div>

          {/* VIDEO TUTORIAL IFRAME */}
          {/*<div className="relative mx-auto mt-16 max-w-4xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-2 shadow-2xl">*/}
          {/*  <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">*/}
          {/*    <iframe*/}
          {/*      className="h-full w-full"*/}
          {/*      src="https://www.youtube.com/embed/YOUR_VIDEO_ID"*/}
          {/*      title="Hookify Tutorial"*/}
          {/*      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"*/}
          {/*      allowFullScreen*/}
          {/*    />*/}
          {/*  </div>*/}
          {/*</div>*/}
        </div>
      </section>

      {/* HOW IT WORKS (THE JOB PROCESS) */}
      <section className="border-y border-slate-900 bg-slate-900/20 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-12 text-center text-3xl font-bold">The Magic Behind the Scenes</h2>
          <div className="grid gap-8 md:grid-cols-4">
            <Step
              number="01"
              title="Import"
              desc="Paste a YouTube link or upload your raw MP4/MOV file."
            />
            <Step
              number="02"
              title="AI Analysis"
              desc="Our engine detects high-energy moments and viral hooks."
            />
            <Step
              number="03"
              title="Face-Track"
              desc="Smart-cropping keeps the speaker perfectly centered."
            />
            <Step
              number="04"
              title="Export"
              desc="Burn-in captions and download your ready-to-post Shorts."
            />
          </div>
        </div>
      </section>

      {/* PRICING (STRIPE INTEGRATION INFO) */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold">Simple, Transparent Pricing</h2>
            <p className="mt-4 text-slate-400">Start for free, upgrade as you grow.</p>
          </div>

          <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
            {/* FREE PLAN */}
            <div className="flex flex-col rounded-3xl border border-slate-800 bg-slate-950 p-8">
              <h3 className="text-xl font-bold">Hobbyist</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-slate-500">/month</span>
              </div>
              <ul className="mt-8 flex-1 space-y-4">
                <PricingItem text="2 AI-generated clips per day" />
                <PricingItem text="Maximum 10 AI-generated clips" />
                <PricingItem text="Standard 720p export" />
                <PricingItem text="Community support" />
              </ul>
              <Link
                href="/register"
                className="mt-8 block rounded-xl border border-slate-700 py-3 text-center font-semibold transition-all hover:bg-slate-900"
              >
                Get Started
              </Link>
            </div>

            {/* PRO PLAN */}
            <div className="relative flex flex-col overflow-hidden rounded-3xl border border-sky-500/50 bg-slate-950 p-8">
              <div className="absolute top-0 right-0 bg-sky-500 px-4 py-1 text-[10px] font-bold tracking-widest text-slate-950 uppercase">
                Popular
              </div>
              <h3 className="text-xl font-bold text-sky-400">Pro Content Creator</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">$14.99</span>
                <span className="text-slate-500">/month</span>
              </div>
              <ul className="mt-8 flex-1 space-y-4">
                <PricingItem text="Unlimited AI-generated clips" active />
                <PricingItem text="Premium captions" active />
                <PricingItem text="Full HD 1080p exports" active />
                <PricingItem text="Face-Aware Smart Crop" active />
                <PricingItem text="Priority job queue (Stripe-powered)" active />
              </ul>
              <Link
                href="/register"
                className="mt-8 block rounded-xl bg-sky-500 py-3 text-center font-semibold text-slate-950 transition-all hover:bg-sky-400"
              >
                Go Pro with Stripe
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-800/70 bg-slate-950/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-slate-500">
            © {new Date().getFullYear()} Hookify • Built for short-form creators.
          </div>
          <div className="flex flex-wrap gap-3 text-[11px]">
            <Link href="/login" className="text-slate-400 hover:text-slate-200">
              Login
            </Link>
            <Link href="/register" className="text-slate-400 hover:text-slate-200">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Step({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <div className="relative rounded-2xl border border-slate-800/50 bg-slate-900/20 p-6">
      <div className="mb-4 text-4xl font-black text-slate-800">{number}</div>
      <div className="mb-2 text-lg font-bold">{title}</div>
      <div className="text-sm leading-relaxed text-slate-400">{desc}</div>
    </div>
  );
}

function PricingItem({ text, active = false }: { text: string; active?: boolean }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <CheckIcon className={`h-4 w-4 ${active ? "text-sky-400" : "text-slate-600"}`} />
      <span className={active ? "text-slate-200" : "text-slate-400"}>{text}</span>
    </li>
  );
}
