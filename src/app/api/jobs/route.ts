import { supabaseServer } from "@/lib/supabase/server";
import { listJobsByOwner } from "@/lib/jobsRepo";

export async function GET() {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) return Response.json({ jobs: [] }, { status: 401 });

    const jobs = await listJobsByOwner(user.id);
    return Response.json({ jobs });
}