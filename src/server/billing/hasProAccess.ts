import { supabaseAdmin } from "@/lib/supabase/admin";

export async function hasProAccess(userId: string) {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
        .from("stripe_subscriptions")
        .select("status,current_period_end")
        .eq("user_id", userId)
        .maybeSingle();

    if (error || !data) return false;

    const ok = data.status === "active" || data.status === "trialing";

    const notExpired =
        !data.current_period_end ||
        new Date(data.current_period_end).getTime() > Date.now();

    return ok && notExpired;
}
