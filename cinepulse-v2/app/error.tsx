'use client';
import { useEffect } from 'react';

/** Error boundary for every page under the root layout (Next 16 passes `retry`). */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && 'digest' in error ? String((error as Error & { digest?: string }).digest || '') : '';
  return (
    <main className="space-page section" style={{ textAlign: 'center', paddingTop: 120 }}>
      <p className="eyebrow mint" style={{ justifyContent: 'center' }}>SOMETHING BROKE</p>
      <h1 style={{ fontSize: 40, margin: '16px 0' }}>This screen didn&apos;t load.</h1>
      <p style={{ maxWidth: 460, margin: '0 auto 28px' }}>
        It may be a brief hiccup. Try again, or head back to the home page.
        {digest && <><br /><small>Reference: {digest}</small></>}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button type="button" className="button primary" onClick={() => retry()}>Try again</button>
        <a className="button secondary" href="/">Go home</a>
      </div>
    </main>
  );
}
