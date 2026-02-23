// supabase/functions/cleanup-pro-jobs/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "shorts";
const HOURS = 48;
const TERMINAL_STATUSES = ["done", "failed"] as const;

const CRON_SECRET = Deno.env.get("CRON_SECRET");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function removeFolderRecursive(
  sb: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
) {
  const paths: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const item of data) {
      if (item?.name) paths.push(`${prefix}${item.name}`);
    }

    if (data.length < limit) break;
    offset += limit;
  }

  if (paths.length === 0) return { removed: 0 };

  const { error: removeErr } = await sb.storage.from(bucket).remove(paths);
  if (removeErr) throw removeErr;

  return { removed: paths.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const incoming = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || incoming !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({
          error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
        }),
        {
          status: 500,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const cutoff = hoursAgoIso(HOURS);

    const { data: subs, error: subsErr } = await sb
      .from("stripe_subscriptions")
      .select("user_id,status")
      .in("status", ["active", "trialing"]);

    if (subsErr) throw subsErr;

    const proUserIds = Array.from(new Set((subs ?? []).map((s) => s.user_id)))
      .filter(Boolean);

    if (proUserIds.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          deletedJobs: 0,
          removedFiles: 0,
          note: "No pro users",
        }),
        {
          status: 200,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        },
      );
    }

    const { data: jobs, error: jobsErr } = await sb
      .from("jobs")
      .select("id,owner_id,created_at,status")
      .in("owner_id", proUserIds)
      .in("status", [...TERMINAL_STATUSES])
      .lt("created_at", cutoff);

    if (jobsErr) throw jobsErr;

    const toDelete = jobs ?? [];

    let removedFiles = 0;
    let deletedJobs = 0;
    let failures = 0;

    for (const job of toDelete) {
      const jobId = job.id as string;

      try {
        const prefix = `jobs/${jobId}/`;
        const { removed } = await removeFolderRecursive(sb, BUCKET, prefix);
        removedFiles += removed;

        const { error: delAssetsErr } = await sb.from("job_assets").delete().eq(
          "job_id",
          jobId,
        );
        if (delAssetsErr) throw delAssetsErr;

        const { error: delJobErr } = await sb.from("jobs").delete().eq(
          "id",
          jobId,
        );
        if (delJobErr) throw delJobErr;

        deletedJobs += 1;
      } catch (_e) {
        failures += 1;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        cutoff,
        proUsers: proUserIds.length,
        candidates: toDelete.length,
        deletedJobs,
        removedFiles,
        failures,
      }),
      {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
