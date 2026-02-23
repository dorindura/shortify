"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

const API = process.env.NEXT_PUBLIC_API_BASE_URL!;

type Job = {
  id: string;
  owner_id: string;
  status: string;
  type: string;
  source: string;
  stage?: string | null;
  progress?: number | null;
  created_at: string;
};

type Profile = {
  id: string;
  email: string | null;
  role: "user" | "admin";
  created_at: string;
};

const supabase = supabaseBrowser();

async function getAuthToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authedJsonFetch(input: string, init: RequestInit = {}) {
  const token = await getAuthToken();
  const headers = new Headers(init.headers);

  const hasBody = init.body !== undefined && init.body !== null;
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [role, setRole] = useState<"user" | "admin">("user");
  const [tab, setTab] = useState<"overview" | "jobs" | "users">("overview");

  const [overview, setOverview] = useState<any>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsStatus, setJobsStatus] = useState<string>("");
  const [jobsQuery, setJobsQuery] = useState<string>("");

  const [users, setUsers] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);

  // Guard auth
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // Load role
  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const r = (data?.role ?? "user") as "user" | "admin";
      setRole(r);
      if (r !== "admin") router.replace("/"); // sau /dashboard
    })();
  }, [user, router]);

  async function loadOverview() {
    const res = await authedJsonFetch(`${API}/api/admin/overview`);
    if (!res.ok) return;
    setOverview(await res.json());
  }

  async function loadJobs() {
    const params = new URLSearchParams();
    if (jobsStatus) params.set("status", jobsStatus);
    if (jobsQuery) params.set("q", jobsQuery);
    params.set("limit", "100");
    params.set("offset", "0");

    const res = await authedJsonFetch(`${API}/api/admin/jobs?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();
    setJobs(Array.isArray(data.jobs) ? data.jobs : []);
  }

  async function loadUsers() {
    const res = await authedJsonFetch(`${API}/api/admin/users`);
    if (!res.ok) return;
    const data = await res.json();
    setUsers(Array.isArray(data.users) ? data.users : []);
  }

  useEffect(() => {
    if (role !== "admin") return;
    loadOverview();
    loadJobs();
    loadUsers();
  }, [role]);

  const [deletingJobs, setDeletingJobs] = useState<Record<string, boolean>>({});

  async function deleteJob(jobId: string) {
    setDeletingJobs((prev) => ({ ...prev, [jobId]: true }));
    try {
      const res = await authedJsonFetch(`${API}/api/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e?.error ?? "Delete failed");
        return;
      }
      await loadJobs();
      await loadOverview();
    } finally {
      setDeletingJobs((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    }
  }

  async function setUserRole(userId: string, newRole: "user" | "admin") {
    setBusy(true);
    try {
      const res = await authedJsonFetch(`${API}/api/admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e?.error ?? "Role update failed");
        return;
      }
      await loadUsers();
    } finally {
      setBusy(false);
    }
  }

  const jobsByStatus = useMemo(() => overview?.jobsByStatus ?? {}, [overview]);

  if (authLoading || !user) return <div className="p-6">Loading...</div>;
  if (role !== "admin") return <div className="p-6">Checking permissions...</div>;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>
          <div className="flex gap-2 text-xs">
            <button
              className={`rounded-full border border-fuchsia-700 px-3 py-1`}
              onClick={() => {
                router.push("/dashboard");
              }}
            >
              Jobs Page
            </button>
            <button
              className={`rounded-full border px-3 py-1 ${tab === "overview" ? "border-sky-500" : "border-slate-700"}`}
              onClick={() => setTab("overview")}
            >
              Overview
            </button>
            <button
              className={`rounded-full border px-3 py-1 ${tab === "jobs" ? "border-sky-500" : "border-slate-700"}`}
              onClick={() => setTab("jobs")}
            >
              Jobs
            </button>
            <button
              className={`rounded-full border px-3 py-1 ${tab === "users" ? "border-sky-500" : "border-slate-700"}`}
              onClick={() => setTab("users")}
            >
              Users
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {tab === "overview" && (
          <section className="grid gap-3 md:grid-cols-4">
            <Card title="Users" value={overview?.users ?? "—"} />
            <Card title="Jobs total" value={overview?.jobsTotal ?? "—"} />
            <Card title="Processing" value={jobsByStatus.processing ?? 0} />
            <Card title="Failed" value={jobsByStatus.failed ?? 0} />
          </section>
        )}

        {tab === "jobs" && (
          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <select
                  value={jobsStatus}
                  onChange={(e) => setJobsStatus(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="pending">pending</option>
                  <option value="processing">processing</option>
                  <option value="done">done</option>
                  <option value="failed">failed</option>
                </select>

                <input
                  value={jobsQuery}
                  onChange={(e) => setJobsQuery(e.target.value)}
                  placeholder="Search source..."
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm sm:w-80"
                />
              </div>

              <button
                disabled={busy}
                onClick={loadJobs}
                className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
              >
                Refresh
              </button>
            </div>

            <div className="overflow-auto rounded-xl border border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/60">
                  <tr className="text-left">
                    <th className="p-3">ID</th>
                    <th className="p-3">Owner</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Source</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-t border-slate-800">
                      <td className="p-3 font-mono">{j.id.slice(0, 8)}…</td>
                      <td className="p-3 font-mono">{j.owner_id.slice(0, 8)}…</td>
                      <td className="p-3">{j.status}</td>
                      <td className="p-3">{j.type}</td>
                      <td className="max-w-[520px] truncate p-3">{j.source}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => deleteJob(j.id)}
                          disabled={!!deletingJobs[j.id]}
                          className="rounded-lg border border-rose-500/70 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
                        >
                          {deletingJobs[j.id] ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {jobs.length === 0 && (
                    <tr>
                      <td className="p-4 text-slate-400" colSpan={6}>
                        No jobs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "users" && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Users</h2>
              <button
                disabled={busy}
                onClick={loadUsers}
                className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
              >
                Refresh
              </button>
            </div>

            <div className="overflow-auto rounded-xl border border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/60">
                  <tr className="text-left">
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Created</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-slate-800">
                      <td className="p-3">{u.email ?? "(no email)"}</td>
                      <td className="p-3">{u.role}</td>
                      <td className="p-3">{new Date(u.created_at).toLocaleString()}</td>
                      <td className="p-3 text-right">
                        {u.role === "admin" ? (
                          <button
                            disabled={busy}
                            onClick={() => setUserRole(u.id, "user")}
                            className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:bg-slate-900 disabled:opacity-60"
                          >
                            Make user
                          </button>
                        ) : (
                          <button
                            disabled={busy}
                            onClick={() => setUserRole(u.id, "admin")}
                            className="rounded-lg border border-emerald-500/70 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60"
                          >
                            Make admin
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td className="p-4 text-slate-400" colSpan={4}>
                        No users.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Card({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="text-xs text-slate-400">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
