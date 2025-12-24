import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

export type AuthedUser = {
    id: string;
    email?: string | null;
};

const supabaseAuthClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
);

export async function requireUserNext(): Promise<AuthedUser | null> {
    const h = await headers();

    const auth = h.get("authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1] || "";

    if (!token) return null;

    const { data, error } = await supabaseAuthClient.auth.getUser(token);
    if (error || !data?.user) return null;

    return { id: data.user.id, email: data.user.email };
}
