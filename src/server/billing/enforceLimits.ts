import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasProAccess } from "./hasProAccess";

export async function enforceJobLimits(
    userId: string,
    requested: { clipDurationSec: number; maxClips: number; aspect: string }
) {
    const isPro = await hasProAccess(userId);
    if (isPro) return { ok: true as const };

    const FREE_MAX_JOBS_PER_DAY = 2;
    const FREE_MAX_DURATION = 30;
    const FREE_MAX_CLIPS = 3;

    if (requested.clipDurationSec > FREE_MAX_DURATION) {
        return { ok: false as const, reason: "Free plan: max 30s per short." };
    }
    if (requested.maxClips > FREE_MAX_CLIPS) {
        return { ok: false as const, reason: "Free plan: max 3 clips." };
    }

    const supabase = supabaseAdmin();
    const day = new Date().toISOString().slice(0, 10);

    const { data: row } = await supabase
        .from("usage_daily")
        .select("jobs_created")
        .eq("user_id", userId)
        .eq("day", day)
        .maybeSingle();

    const used = row?.jobs_created ?? 0;

    if (used >= FREE_MAX_JOBS_PER_DAY) {
        return { ok: false as const, reason: "Free plan: daily job limit reached." };
    }

    await supabase.from("usage_daily").upsert(
        {
            user_id: userId,
            day,
            jobs_created: used + 1,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,day" }
    );

    return { ok: true as const };
}
