import type { Metadata } from "next";
import { Space_Grotesk, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { MotionProvider } from "./motion-provider";
import WagmiProviders from "./wagmi-provider";
import Nav from "./nav";
import { Logo } from "@/components/ui";
import footerStyles from "./footer.module.css";
import "./globals.css";

/*
 * Three font roles (Noviq UI Playbook §8):
 *   display → Space Grotesk  → --font-display-src
 *   sans    → Geist          → --font-sans-src
 *   mono    → Geist Mono     → --font-mono-src
 * tokens.css resolves var(--font-*-src, "<fallback>") against these.
 */
const fontDisplay = Space_Grotesk({
  variable: "--font-display-src",
  subsets: ["latin"],
});
const fontSans = Geist({
  variable: "--font-sans-src",
  subsets: ["latin"],
});
const fontMono = Geist_Mono({
  variable: "--font-mono-src",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sentric",
  description:
    "The self-insuring portfolio — an autonomous guardian that lives entirely on the Somnia blockchain.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* No-FOUC theme script: apply a saved light theme before first paint. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{if(localStorage.getItem("app-theme")==="light"){document.documentElement.dataset.theme="light"}}catch(e){}})();`}
        </Script>
        {/* Framer Motion honors the user's OS reduced-motion setting app-wide. */}
        <WagmiProviders>
          <MotionProvider>
            <Nav />
            {children}
            <footer className={footerStyles.footer}>
              <Logo href="/" />
              <p className={footerStyles.text}>
                Built on Somnia · DreamDEX Event Contracts · Somnia Agents
              </p>
            </footer>
          </MotionProvider>
        </WagmiProviders>
      </body>
    </html>
  );
}
