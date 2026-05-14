"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpErr) throw signUpErr;
      const userId = data.user?.id;
      if (userId) {
        const { error: profileErr } = await supabase.from("profiles").insert({
          id: userId,
          name,
        });
        if (profileErr) throw profileErr;
      }
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Failed to register.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#0a0a0a] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-from)_0%,_transparent_100%)] from-[#1a1a2e] to-[#0a0a0a] p-4">
      <div className="group relative w-full max-w-[420px] rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
        {/* Accent Glow Green for Register */}
        <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-emerald-500/10 blur-[100px] transition-all duration-700 group-hover:bg-emerald-500/20" />

        <div className="relative z-10">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">Join Hookify</h1>
          <p className="mb-8 text-sm text-gray-400">Start creating viral shorts in minutes.</p>

          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <label className="ml-1 text-xs font-medium text-gray-400">Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                required
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3.5 text-white transition-all placeholder:text-gray-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
              />
            </div>

            <div className="grid gap-1.5">
              <label className="ml-1 text-xs font-medium text-gray-400">Email Address</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                type="email"
                required
                autoComplete={"new-name"}
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3.5 text-white transition-all placeholder:text-gray-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
              />
            </div>

            <div className="grid gap-1.5">
              <label className="ml-1 text-xs font-medium text-gray-400">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                type="password"
                required
                autoComplete={"new-password"}
                minLength={8}
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3.5 text-white transition-all placeholder:text-gray-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              disabled={loading}
              className="mt-2 w-full rounded-2xl bg-emerald-500 p-3.5 font-bold text-black shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Register"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-400">
            Already have an account?{" "}
            <a
              href="/login"
              className="font-medium text-white decoration-emerald-500 underline-offset-4 hover:underline"
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
