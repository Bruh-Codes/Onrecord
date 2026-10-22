import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
	title: "Onrecord - SME Credit Readiness Assistant",
	description:
		"Turn a folder of business records into a lender-ready financial profile.",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" className="h-full antialiased" suppressHydrationWarning>
			<body className="min-h-full font-sans">
				<Providers>
					<ThemeProvider
						attribute="class"
						defaultTheme="light"
						enableSystem={false}
						disableTransitionOnChange
					>
						<ToastProvider>{children}</ToastProvider>
					</ThemeProvider>
				</Providers>
			</body>
		</html>
	);
}
