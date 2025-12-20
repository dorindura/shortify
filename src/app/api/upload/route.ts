// src/app/api/upload/route.ts
import { NextResponse } from "next/server";
import { addJob, JobAspect } from "@lib/jobsStore";
import { hasVideoExtension } from "@utils/validators";
import { randomUUID } from "crypto";
import { enqueueJob } from "@server/jobs/queue";
import { promises as fs } from "fs";
import path from "path";
import {requireUser} from "@server/auth/requireUser";

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

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const fileName = `${Date.now()}-${safeName}`;
    const filePath = path.join(uploadsDir, fileName);

    await fs.writeFile(filePath, buffer);

    const now = new Date().toISOString();

    const aspectField = formData.get("aspect");
    const aspect: JobAspect =
        aspectField === "vertical" ? "vertical" : "horizontal";

    const job = {
        id: randomUUID(),
        ownerId: user.id,
        type: "upload" as const,
        source: filePath,
        status: "pending" as const,
        aspect: aspect,
        createdAt: now,
        updatedAt: now,
    };

    addJob(job);
    enqueueJob(job).catch(console.error);

    return NextResponse.json({ job }, { status: 201 });
}
