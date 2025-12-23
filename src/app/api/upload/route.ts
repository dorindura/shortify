// src/app/api/upload/route.ts
import { NextResponse } from "next/server";
import type { Job, JobAspect, CaptionStyle } from "@lib/jobsStore";
import { hasVideoExtension } from "@utils/validators";
import { randomUUID } from "crypto";
import { enqueueJob } from "@server/jobs/queue";
import { promises as fs } from "fs";
import path from "path";
import { requireUser } from "@server/auth/requireUser";
import { enforceJobLimits } from "@server/billing/enforceLimits";
import { createJob } from "@lib/jobsRepo";

export async function POST(req: Request) {
    const { user, res } = await requireUser();
    if (res) return res;

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!hasVideoExtension(file.name)) {
        return NextResponse.json({ error: "File is not a supported video type" }, { status: 400 });
    }

    // parse options
    const aspectField = String(formData.get("aspect") ?? "horizontal");
    const aspect: JobAspect =
        aspectField === "horizontal" || aspectField === "vertical" || aspectField === "verticalLetterbox"
            ? aspectField
            : "horizontal";

    const clipDurationSecRaw = Number(formData.get("clipDurationSec") ?? 30);
    const clipDurationSec = Number.isFinite(clipDurationSecRaw) && clipDurationSecRaw > 0 ? clipDurationSecRaw : 30;

    const maxClipsRaw = Number(formData.get("maxClips") ?? 3);
    const maxClips = Number.isFinite(maxClipsRaw) && maxClipsRaw > 0 ? maxClipsRaw : 3;

    const captionsEnabledRaw = String(formData.get("captionsEnabled") ?? "true");
    const captionsEnabled = captionsEnabledRaw === "true";

    const captionStyleField = String(formData.get("captionStyle") ?? "karaoke");
    const captionStyle: CaptionStyle =
        captionStyleField === "boldYellow" || captionStyleField === "subtle" || captionStyleField === "karaoke"
            ? captionStyleField
            : "karaoke";

    const limit = await enforceJobLimits(user.id, { clipDurationSec, maxClips, aspect });
    if (!limit.ok) {
        return NextResponse.json(
            { error: limit.reason, upgradeRequired: true },
            { status: 402 }
        );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const fileName = `${Date.now()}-${safeName}`;
    const filePath = path.join(uploadsDir, fileName);

    await fs.writeFile(filePath, buffer);

    const now = new Date().toISOString();

    const job: Job = {
        id: randomUUID(),
        ownerId: user.id,
        type: "upload",
        source: filePath,
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

    await createJob(job);
    enqueueJob(job).catch(console.error);

    return NextResponse.json({ job }, { status: 201 });
}
