import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import AppShell from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { DispatchProvider } from "@/components/providers/DispatchProvider";
import AegisCopilot from "@/components/copilot/AegisCopilot";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Sentinel — AI Emergency Response Command",
  description:
    "AI-powered emergency dispatch, ambulance tracking and accident-risk command center for Indian cities",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} h-full`}
    >
      <body className="h-full bg-[var(--color-background)] text-[var(--color-on-surface)] antialiased">
        <ToastProvider>
          <DispatchProvider>
            <AppShell>{children}</AppShell>
            <AegisCopilot />
          </DispatchProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

