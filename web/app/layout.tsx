import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Anton } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { baseUrl, SITE_NAME, X_HANDLE } from "@/lib/site";
import SessionProvider from "@/components/SessionProvider";
import UtmCapture from "@/components/UtmCapture";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
});

const title = "SweepSzn — Can you build an undefeated all-time NBA five?";
const description = "Draft a five-player all-time NBA lineup and find out if it can go undefeated. Engine calibrated to 1,170 real team-seasons — and it tells you why.";

// viewport-fit=cover lets the layout extend under the iOS home indicator so our env(safe-area-inset)
// padding on the mobile position sheet + game shell actually takes effect.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title,
  description,
  openGraph: { title, description, siteName: SITE_NAME, type: "website" },
  twitter: { card: "summary_large_image", title, description, site: X_HANDLE, creator: X_HANDLE },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProvider>{children}</SessionProvider>
        <UtmCapture />
        <Analytics />
      </body>
    </html>
  );
}
