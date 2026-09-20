import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>{children}</body>
    </html>
  );
}
