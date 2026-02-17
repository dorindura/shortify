// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import {AuthProvider} from "@components/AuthProvider";

export const metadata: Metadata = {
    title: "Hookify – Turn any video into shorts",
    description: "Upload or paste a link, get ready-to-post short clips.",
    icons: {
        icon: [
            { url: "/shortify-icon.svg", sizes: "52x52", type: "image/svg" },
        ],
        apple: "/shortify-icon.svg",
    },
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
