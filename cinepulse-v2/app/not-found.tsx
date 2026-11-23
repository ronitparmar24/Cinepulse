import Link from 'next/link';

export const metadata = { title: 'Not found — CinePulse' };

export default function NotFound() {
  return (
    <main className="space-page section" style={{ textAlign: 'center', paddingTop: 120 }}>
      <p className="eyebrow mint" style={{ justifyContent: 'center' }}>404</p>
      <h1 style={{ fontSize: 40, margin: '16px 0' }}>That page isn&apos;t in the catalogue.</h1>
      <p style={{ maxWidth: 460, margin: '0 auto 28px' }}>The link may be old, or the film or profile may have moved.</p>
      <Link className="button primary" href="/">Back to CinePulse</Link>
    </main>
  );
}
