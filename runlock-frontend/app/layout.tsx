import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from 'next-themes'

const font = Outfit({
  weight: '400',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: "RunLock",
    template: "%s | RunLock",
  },
  description: "Run for your money.",
  metadataBase: new URL("https://vercel.app"),
  openGraph: {
    title: "RunLock",
    description: "Run for your money.",
    url: "https://vercel.app",
    siteName: "RunLock",
    images: [
      {
        url: "https://vercel.app",
        width: 1000,
        height: 640,
        alt: "RunLock",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RunLock",
    description: "Run for your money.",
    images: [""],
    creator: "@ericchen890",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  themeColor: "#FFF",
  manifest: "",
  other: {
    "theme-color": "#FFF",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${font.className} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
