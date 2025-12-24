// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import {AuthProvider} from "@components/AuthProvider";

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
            <AuthProvider>
                {children}
            </AuthProvider>
        </body>
        </html>
    );
}
