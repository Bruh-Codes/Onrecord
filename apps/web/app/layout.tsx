import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Onrecord — SME Credit Readiness Assistant",
  description: "Turn a folder of business records into a lender-ready financial profile.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-[family-name:var(--font-body)]">{children}</body>
    </html>
  );
}
