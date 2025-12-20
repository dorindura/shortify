import { supabaseServer } from "@/lib/supabase/server";
import { listJobsByOwner } from "@/lib/jobsStore";

export async function GET() {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) return Response.json({ jobs: [] }, { status: 401 });

    const jobs = listJobsByOwner(user.id);
    return Response.json({ jobs });
}