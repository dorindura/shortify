"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
    const router = useRouter();
    const supabase = useMemo(() => supabaseBrowser(), []);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
            if (signInErr) throw signInErr;
            router.push("/dashboard");
        } catch (err: any) {
            setError(err?.message ?? "Failed to login.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0a] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-from)_0%,_transparent_100%)] from-[#1a1a2e] to-[#0a0a0a] p-4">
            {/* Glass Card */}
            <div className="w-full max-w-[420px] backdrop-blur-xl bg-white/5 border border-white/10 p-8 rounded-3xl shadow-2xl overflow-hidden relative group">
                {/* Accent Glow */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/20 blur-[100px] rounded-full group-hover:bg-blue-500/30 transition-all duration-700" />

                <div className="relative z-10">
                    <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Welcome Back</h1>
                    <p className="text-gray-400 text-sm mb-8">Sign in to continue to Hookify.</p>

                    <form onSubmit={onSubmit} className="grid gap-4">
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium text-gray-400 ml-1">Email Address</label>
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                                type="email"
                                required
                                className="w-full p-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                            />
                        </div>

                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium text-gray-400 ml-1">Password</label>
                            <input
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                type="password"
                                required
                                className="w-full p-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-red-400 bg-red-400/10 p-3 rounded-xl border border-red-400/20">
                                {error}
                            </div>
                        )}

                        <button
                            disabled={loading}
                            className="w-full mt-2 p-3.5 bg-white text-black font-bold rounded-2xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                        >
                            {loading ? "Authenticating..." : "Login"}
                        </button>
                    </form>

                    <p className="mt-8 text-center text-sm text-gray-400">
                        Don&apos;t have an account?{" "}
                        <a href="/register" className="text-white font-medium hover:underline decoration-blue-500 underline-offset-4">
                            Create one
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}