import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/mek/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "مکانیکس | تعمیر و نگهداری سیار خودرو و ماشین‌آلات سنگین در محل",
    template: "%s | مکانیکس",
  },
  description:
    "مکانیکس پلتفرم تعمیر و نگهداری سیار در ایران است. مکانیک‌های تأییدشده برای خودرو، کامیون، اتوبوس، بیل، لودر و ماشین‌آلات سنگین — عیب‌یابی، تعمیر و نگهداری در محل شما، با گارانتی ۶ ماهه و پرداخت امن.",
  keywords: [
    "مکانیک سیار", "تعمیرکار سیار", "تعمیر ماشین در محل", "تعمیر خودرو در محل",
    "مکانیک سنگین", "تعمیر ماشین‌آلات سنگین", "تعمیر بیل", "تعمیر لودر",
    "تعمیر کامیون", "تعمیر اتوبوس", "عیب‌یابی خودرو", "تعمیر اضطراری جاده‌ای",
    "نگهداری ناوگان", "سرویس دوره‌ای خودرو", "مکانیک ایران", "تعمیر در محل تهران",
    "MEKANIX", "mobile mechanic", "on-site repair", "heavy machinery repair",
  ],
  manifest: "/manifest.json",
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/logo.webp", type: "image/webp" }, { url: "/logo.png", sizes: "any" }],
    apple: [{ url: "/logo.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "مکانیکس",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${display.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
          <Toaster />
          <SonnerToaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
