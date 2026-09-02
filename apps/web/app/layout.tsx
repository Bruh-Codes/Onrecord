import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Onrecord — SME Credit Readiness Assistant",
  description: "Turn a folder of business records into a lender-ready financial profile.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full font-[family-name:var(--font-body)]">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
