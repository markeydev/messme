import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeController } from "@/components/ThemeController";

export const metadata: Metadata = {
  title: "Messme",
  description: "Безопасный мессенджер с end-to-end шифрованием.",
  keywords: ["messenger", "E2E", "encryption", "chat", "secure", "private"],
  authors: [{ name: "Messenger Team" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Messme",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#030712",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className="antialiased overscroll-none"
      >
        {/* Flash prevention: apply dark class before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `try{var d=JSON.parse(localStorage.getItem('messenger-storage')||'{}');if(d.state?.darkMode)document.documentElement.classList.add('dark')}catch(e){}` }} />
        <ThemeController />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
