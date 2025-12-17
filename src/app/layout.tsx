// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Shortify – Turn any video into shorts",
    description: "Upload or paste a link, get ready-to-post short clips.",
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
        <body className="min-h-screen bg-slate-950 text-slate-50">
        {children}
        </body>
        </html>
    );
}
