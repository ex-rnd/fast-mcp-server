import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@descope/nextjs-sdk";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FastMCP × Descope — MCP Client with JSON-RPC & Agentic Identity",
  description:
    "Production-ready MCP Client demo using FastMCP and the Descope Agentic Identity Hub. Demonstrates JSON-RPC 2.0, Dynamic Client Registration, tool-level authorization, and credential vaulting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {projectId ? (
          <AuthProvider projectId={projectId}>{children}</AuthProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
