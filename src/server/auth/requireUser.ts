import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function requireUser() {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
        return { user: null, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }

    return { user: data.user, res: null };
}
