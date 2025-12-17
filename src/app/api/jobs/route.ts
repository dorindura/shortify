// src/app/api/jobs/route.ts
import { NextResponse } from "next/server";
import { listJobs } from "@lib/jobsStore";

export async function GET() {
    const jobs = listJobs();
    return NextResponse.json({ jobs });
}
