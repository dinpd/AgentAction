import type { Metadata } from "next";
import "./globals.css";

const siteOrigin = "https://agentaction.dev";
const socialImage = `${siteOrigin}/og-trust-layer.png`;
const siteTitle = "AgentAction — Connect agents to tools, safely and reliably";
const siteDescription = "Start with an agent recipe, test it against your job, and keep visibility and control over every run with AgentAction.";

export const dynamic = "force-static";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: siteTitle,
    template: "%s — AgentAction",
  },
  description: siteDescription,
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
    title: siteTitle,
    description: siteDescription,
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
    title: siteTitle,
    description: siteDescription,
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
      description: siteDescription,
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
