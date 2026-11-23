'use client';

/** Last-resort boundary when the root layout itself fails. Renders its own document and styles. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b0e12', color: '#f4f6f5', fontFamily: 'system-ui, sans-serif' }}>
        <title>CinePulse — something went wrong</title>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 28, marginBottom: 12 }}>CinePulse hit a problem.</h1>
          <p style={{ color: '#a9b5bb', marginBottom: 24 }}>Please try again in a moment.</p>
          <button type="button" onClick={() => retry()} style={{ padding: '12px 22px', borderRadius: 11, border: 0, background: '#b3f3d5', color: '#12291e', fontWeight: 700, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
