import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'CinePulse — Transparent Box-Office Predictions';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#030712',
          backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(45, 212, 191, 0.15), transparent 70%)',
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '60px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2dd4bf, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: 800,
              color: '#030712',
            }}
          >
            C
          </div>
          <span
            style={{
              fontSize: '44px',
              fontWeight: 900,
              letterSpacing: '-1.5px',
              background: 'linear-gradient(to right, #ffffff, #94a3b8)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            CinePulse
          </span>
        </div>

        <p
          style={{
            fontSize: '32px',
            fontWeight: 700,
            color: '#f8fafc',
            textAlign: 'center',
            maxWidth: '900px',
            lineHeight: 1.3,
            margin: '0 0 16px 0',
          }}
        >
          Cinema, Ahead of the Curve
        </p>

        <p
          style={{
            fontSize: '20px',
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: '750px',
            lineHeight: 1.5,
            margin: '0 0 36px 0',
          }}
        >
          Empirical machine-learning predictions, calibrated box-office intervals, and competitive community forecasting.
        </p>

        <div
          style={{
            display: 'flex',
            gap: '24px',
          }}
        >
          <div
            style={{
              padding: '10px 24px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(45, 212, 191, 0.1)',
              border: '1px solid rgba(45, 212, 191, 0.3)',
              color: '#2dd4bf',
              fontSize: '16px',
              fontWeight: 600,
            }}
          >
            Ridge + Platt Calibrated ML
          </div>
          <div
            style={{
              padding: '10px 24px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              fontSize: '16px',
              fontWeight: 600,
            }}
          >
            Brier Quadratic Scoring
          </div>
          <div
            style={{
              padding: '10px 24px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              color: '#c084fc',
              fontSize: '16px',
              fontWeight: 600,
            }}
          >
            Social Watch Circles
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
