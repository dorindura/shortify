// src/app/api/url/route.ts
import { NextResponse } from "next/server";
import { addJob } from "@lib/jobsStore";
import type { Job, CaptionStyle, JobAspect } from "@lib/jobsStore";
import { isValidUrl } from "@utils/validators";
import { randomUUID } from "crypto";
import { enqueueJob } from "@server/jobs/queue";

export async function POST(req: Request) {
    // 👇 IMPORTANT: JSON, not formData
    const body = await req.json().catch(() => null);

    if (!body || typeof body.url !== "string") {
        return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const url = body.url.trim();

    if (!isValidUrl(url)) {
        return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // ---- read options from JSON body ----
    const rawAspect = body.aspect as JobAspect | undefined;
    const aspect: JobAspect =
        rawAspect === "vertical" || rawAspect === "horizontal"
            ? rawAspect
            : "horizontal";

    const clipDurationSec =
        typeof body.clipDurationSec === "number" && body.clipDurationSec > 0
            ? body.clipDurationSec
            : 30;

    const maxClips =
        typeof body.maxClips === "number" && body.maxClips > 0
            ? body.maxClips
            : 3;

    const captionsEnabled =
        typeof body.captionsEnabled === "boolean"
            ? body.captionsEnabled
            : true;

    const rawStyle = body.captionStyle as CaptionStyle | undefined;
    const captionStyle: CaptionStyle =
        rawStyle === "boldYellow" ||
        rawStyle === "subtle" ||
        rawStyle === "karaoke"
            ? rawStyle
            : "karaoke";

    const job: Job = {
        id: randomUUID(),
        type: "url",
        source: url,
        status: "pending",
        createdAt: now,
        updatedAt: now,

        aspect,
        clipDurationSec,
        maxClips,
        captionsEnabled,
        captionStyle,

        clips: [],
        captionedClips: [],
        captionedThumbs: [],
        stage: "queued",
        progress: 0,
    };

    addJob(job);
    enqueueJob(job).catch(console.error);

    return NextResponse.json({ job }, { status: 201 });
}
