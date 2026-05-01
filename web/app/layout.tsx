import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Pirata_One } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Police pirate pour les titres OnePiece TCG (cinematics, victoire,
// défaite, leader showdown). Utilisée via la classe Tailwind
// `font-pirate` (cf. globals.css).
const pirataOne = Pirata_One({
  variable: "--font-pirata-one",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Site Ultime",
  description: "Univers 2D multijoueur — casino, RPG, jeux de cartes et plus.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Site Ultime",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      data-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} ${pirataOne.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
        <a href="#main-content" className="skip-link">
          Aller au contenu
        </a>
        <ThemeProvider>{children}</ThemeProvider>
        <div
          id="a11y-live-region"
          role="status"
          aria-live="polite"
          className="sr-only"
        />
      </body>
    </html>
  );
}
