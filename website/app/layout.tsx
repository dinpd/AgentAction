import type { Metadata } from "next";
import "./globals.css";

const siteOrigin = "https://agentaction.dev";
const socialImage = `${siteOrigin}/og-trust-layer.png`;

export const dynamic = "force-static";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
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
    canonical: `${siteOrigin}/`,
  },
  openGraph: {
    type: "website",
    url: siteOrigin,
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

const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteOrigin}/#organization`,
      name: "AgentAction",
      url: `${siteOrigin}/`,
      logo: {
        "@type": "ImageObject",
        url: `${siteOrigin}/logo.png`,
        width: 512,
        height: 512,
      },
      sameAs: ["https://github.com/dinpd/AgentAction"],
    },
    {
      "@type": "WebSite",
      "@id": `${siteOrigin}/#website`,
      url: `${siteOrigin}/`,
      name: "AgentAction",
      description:
        "Trust infrastructure for autonomous AI agents, from decision assurance through action authorization and execution evidence.",
      publisher: { "@id": `${siteOrigin}/#organization` },
      inLanguage: "en",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteStructuredData) }}
        />
        {children}
      </body>
    </html>
  );
}
