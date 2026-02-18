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
            const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
            if (signUpErr) throw signUpErr;
            const userId = data.user?.id;
            if (userId) {
                const { error: profileErr } = await supabase.from("profiles").insert({ id: userId, name });
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
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0a] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-from)_0%,_transparent_100%)] from-[#1a1a2e] to-[#0a0a0a] p-4">
            <div className="w-full max-w-[420px] backdrop-blur-xl bg-white/5 border border-white/10 p-8 rounded-3xl shadow-2xl relative group">
                {/* Accent Glow Green for Register */}
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 blur-[100px] rounded-full group-hover:bg-emerald-500/20 transition-all duration-700" />

                <div className="relative z-10">
                    <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Join Hookify</h1>
                    <p className="text-gray-400 text-sm mb-8">Start creating viral shorts in minutes.</p>

                    <form onSubmit={onSubmit} className="grid gap-4">
                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium text-gray-400 ml-1">Full Name</label>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="John Doe"
                                required
                                className="w-full p-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                            />
                        </div>

                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium text-gray-400 ml-1">Email Address</label>
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                                type="email"
                                required
                                className="w-full p-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                            />
                        </div>

                        <div className="grid gap-1.5">
                            <label className="text-xs font-medium text-gray-400 ml-1">Password</label>
                            <input
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Min. 8 characters"
                                type="password"
                                required
                                minLength={8}
                                className="w-full p-3.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-red-400 bg-red-400/10 p-3 rounded-xl border border-red-400/20">
                                {error}
                            </div>
                        )}

                        <button
                            disabled={loading}
                            className="w-full mt-2 p-3.5 bg-emerald-500 text-black font-bold rounded-2xl hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
                        >
                            {loading ? "Creating account..." : "Register"}
                        </button>
                    </form>

                    <p className="mt-8 text-center text-sm text-gray-400">
                        Already have an account?{" "}
                        <a href="/login" className="text-white font-medium hover:underline decoration-emerald-500 underline-offset-4">
                            Sign in
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}