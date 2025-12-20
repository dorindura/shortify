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
                const { error: profileErr } = await supabase
                    .from("profiles")
                    .insert({ id: userId, name });
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
        <div style={{ maxWidth: 420, margin: "60px auto", padding: 16 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Create account</h1>

            <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    required
                    style={{ padding: 12, borderRadius: 10, border: "1px solid #333" }}
                />
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
                    placeholder="Password (min 8 chars)"
                    type="password"
                    required
                    minLength={8}
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
                    {loading ? "Creating..." : "Register"}
                </button>
            </form>

            <p style={{ marginTop: 14 }}>
                Already have an account?{" "}
                <a href="/login" style={{ textDecoration: "underline" }}>
                    Login
                </a>
            </p>
        </div>
    );
}
