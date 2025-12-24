"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

type AuthCtx = {
    user: User | null;
    loading: boolean;
    refresh: () => Promise<void>;
    signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        const { data } = await supabase.auth.getUser();
        setUser(data.user ?? null);
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
    };

    useEffect(() => {
        let mounted = true;

        (async () => {
            setLoading(true);
            const { data } = await supabase.auth.getUser();
            if (mounted) setUser(data.user ?? null);
            if (mounted) setLoading(false);
        })();

        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => {
            mounted = false;
            sub.subscription.unsubscribe();
        };
    }, [supabase]);

    const value: AuthCtx = { user, loading, refresh, signOut };

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider />");
    return ctx;
}
