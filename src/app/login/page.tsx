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
            const { error: signInErr } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (signInErr) throw signInErr;

            router.push("/dashboard");
        } catch (err: any) {
            setError(err?.message ?? "Failed to login.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 420, margin: "60px auto", padding: 16 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Login</h1>

            <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
                <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    type="email"
                    required
                    style={{ padding: 12, borderRadius: 10, border: "1px solid #333" }}
                />
                <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    type="password"
                    required
                    style={{ padding: 12, borderRadius: 10, border: "1px solid #333" }}
                />

                {error && <div style={{ color: "tomato" }}>{error}</div>}

                <button
                    disabled={loading}
                    style={{
                        padding: 12,
                        borderRadius: 10,
                        border: "none",
                        fontWeight: 700,
                        cursor: "pointer",
                    }}
                >
                    {loading ? "Logging in..." : "Login"}
                </button>
            </form>

            <p style={{ marginTop: 14 }}>
                No account?{" "}
                <a href="/register" style={{ textDecoration: "underline" }}>
                    Register
                </a>
            </p>
        </div>
    );
}
