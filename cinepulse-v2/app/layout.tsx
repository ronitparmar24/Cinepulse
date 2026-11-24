import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import localFont from 'next/font/local';
import './globals.css';

// Self-hosted Manrope (variable, OFL licence in app/fonts/). Replaces a render-blocking CDN @import.
const manrope = localFont({
  src: [
    { path: './fonts/manrope-latin-wght-normal.woff2', weight: '200 800', style: 'normal' },
    { path: './fonts/manrope-latin-ext-wght-normal.woff2', weight: '200 800', style: 'normal' },
  ],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN || 'https://cinepulse.app'),
  title: 'Cinepulse — Cinema, ahead of the curve',
  description: 'Discover your next obsession. A film and series journal with transparent community predictions and empirical ML box-office forecasting.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'Cinepulse — Cinema, ahead of the curve',
    description: 'Letterboxd-style cinema tracking with transparent box-office forecasting and community opening calls.',
    url: 'https://cinepulse.app',
    siteName: 'Cinepulse',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cinepulse — Cinema, ahead of the curve',
    description: 'Letterboxd-style cinema tracking with transparent box-office forecasting and community opening calls.',
  },
};

export const viewport: Viewport = {
  themeColor: '#030712',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // Lets the page use env(safe-area-inset-*) so bars clear the notch and home indicator.
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request so proxy.ts can attach a fresh CSP nonce to every script.
  await connection();
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>{children}</body>
    </html>
  );
}
