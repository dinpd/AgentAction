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
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title: {
      default: "AgentAction — Action authorization for AI agents",
      template: "%s — AgentAction",
    },
    description:
      "AgentAction controls consequential AI agent actions and preserves independently verifiable evidence of what was authorized and executed.",
    alternates: {
      canonical: "https://agentaction.dev/",
    },
    openGraph: {
      type: "website",
      url: "https://agentaction.dev",
      siteName: "AgentAction",
      title: "AgentAction — Control the action. Prove what happened.",
      description:
        "Open-source action authorization and execution assurance for AI agents.",
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "AgentAction — Control the action. Prove what happened.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "AgentAction — Control the action. Prove what happened.",
      description:
        "Open-source action authorization and execution assurance for AI agents.",
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
