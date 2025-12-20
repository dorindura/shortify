import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();

    return Response.json({
        hasUser: !!data.user,
        userId: data.user?.id ?? null,
        email: data.user?.email ?? null,
        error: error?.message ?? null,
    });
}
