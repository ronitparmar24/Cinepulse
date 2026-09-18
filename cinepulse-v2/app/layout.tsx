import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Cinepulse — Cinema, ahead of the curve', description: 'Discover your next obsession. A film and series journal with transparent community predictions.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en" suppressHydrationWarning><body>{children}</body></html>; }
