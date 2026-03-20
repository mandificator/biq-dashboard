import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";
import SideNav from "@/components/SideNav";
import ThemeToggle from "@/components/ThemeToggle";

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "biq Analytics",
  description: "Real-time event analytics dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceMono.variable} ${spaceMono.className}`}>
        <div className="h-screen flex overflow-hidden">
          <SideNav />
          <div className="flex-1 min-w-0">{children}</div>
          <ThemeToggle />
        </div>
      </body>
    </html>
  );
}
