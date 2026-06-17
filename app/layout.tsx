import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://agent-cfo-for-arc.local"),
  title: {
    default: "Agent CFO for Arc",
    template: "%s | Agent CFO for Arc",
  },
  description:
    "Real-time spend intelligence for autonomous AI agents using Arc, USDC nanopayments, and x402-style paid services.",
  openGraph: {
    title: "Agent CFO for Arc",
    description:
      "A CFO-style observability dashboard for autonomous agents that spend USDC on Arc.",
    type: "website",
    locale: "en_US",
    siteName: "Agent CFO for Arc",
  },
};

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
