import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "@commerce-ai-tool/react/styles.css";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--cat-font",
});

export const metadata: Metadata = {
  title: "Commerce AI Tool — Demo",
  description: "AI-powered commercetools product search demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        <a className="demo-skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
