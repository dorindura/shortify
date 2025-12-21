import { NextResponse } from "next/server";

export async function GET(req: Request) {
    const url = new URL(req.url);
    const fileUrl = url.searchParams.get("url");
    const filename = url.searchParams.get("filename") || "short.mp4";

    if (!fileUrl) {
        return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const upstream = await fetch(fileUrl);
    if (!upstream.ok || !upstream.body) {
        return NextResponse.json({ error: "Failed to fetch file" }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
        headers: {
            "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
        },
    });
}
