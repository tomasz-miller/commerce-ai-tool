import type { Metadata } from "next";
import "@commerce-ai-tool/react/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commerce AI Tool — Demo",
  description: "AI-powered commercetools product search demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
