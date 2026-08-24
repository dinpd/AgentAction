import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const candidateHost =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(candidateHost)
    ? candidateHost
    : "agentaction.dev";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol =
    forwardedProtocol === "http" || host.startsWith("localhost:")
      ? "http"
      : "https";
  const origin = `${protocol}://${host}`;
  const socialImage = new URL("/og-trust-layer.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title: {
      default: "AgentAction — Trust infrastructure for autonomous AI agents",
      template: "%s — AgentAction",
    },
    description:
      "AgentAction evaluates agent decisions, enforces policy, authorizes actions, and preserves verifiable evidence from intent through execution.",
    icons: {
      icon: [
        { url: "/favicon.png", type: "image/png", sizes: "64x64" },
        { url: "/logo.png", type: "image/png", sizes: "512x512" },
      ],
      apple: [
        { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
      ],
    },
    alternates: {
      canonical: "https://agentaction.dev/",
    },
    openGraph: {
      type: "website",
      url: "https://agentaction.dev",
      siteName: "AgentAction",
      title: "AgentAction — The trust layer for autonomous AI agents",
      description:
        "Evaluate decisions, enforce policy, authorize actions, and preserve verifiable evidence from intent through execution.",
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "AgentAction — The trust layer for autonomous AI agents",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "AgentAction — The trust layer for autonomous AI agents",
      description:
        "Evaluate decisions, enforce policy, authorize actions, and preserve verifiable evidence from intent through execution.",
      images: [socialImage],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
