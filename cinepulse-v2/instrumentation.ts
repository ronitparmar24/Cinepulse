/** Runs once when a server instance starts: report configuration problems early. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { checkEnvironment } = await import('./lib/env');
  for (const p of checkEnvironment()) {
    (p.level === 'error' ? console.error : console.warn)(`[CINEPULSE CONFIG] ${p.level.toUpperCase()}: ${p.message}`);
  }
}
