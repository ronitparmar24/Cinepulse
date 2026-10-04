import { ImageResponse } from 'next/og';
import { getForecastReceiptById } from '@/lib/receipts';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const receipt = getForecastReceiptById(id);

  const titleName = receipt?.titleName || 'Theatrical Forecast';
  const isCalled = receipt?.verdict === 'called';
  const verdictText = isCalled ? 'Called it ✅' : 'Missed ❌';
  const verdictColor = isCalled ? '#2dd4bf' : '#f43f5e';
  const prob = receipt ? `${receipt.predictedProbability}% Hit` : '—';
  const actualText = receipt ? (receipt.actualHit ? 'Actual: Theatrical Hit' : 'Actual: Theatrical Flop') : '—';
  const model = receipt?.modelVersion || 'cinepulse-ml-v3';

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #2dd4bf, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 800, color: '#030712' }}>C</div>
          <span style={{ fontSize: '32px', fontWeight: 900, color: '#ffffff' }}>CinePulse Receipts</span>
        </div>

        <div style={{ background: isCalled ? 'rgba(45, 212, 191, 0.15)' : 'rgba(244, 63, 94, 0.15)', border: `2px solid ${verdictColor}`, borderRadius: '16px', padding: '10px 28px', fontSize: '36px', fontWeight: 900, color: verdictColor, marginBottom: '24px' }}>
          {verdictText}
        </div>

        <h1 style={{ fontSize: '48px', fontWeight: 800, color: '#f8fafc', textAlign: 'center', maxWidth: '1000px', margin: '0 0 16px 0', lineHeight: 1.2 }}>
          {titleName}
        </h1>

        <div style={{ display: 'flex', gap: '32px', marginTop: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '16px 28px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: '14px', color: '#94a3b8', textTransform: 'uppercase' }}>Model Prediction</span>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff', marginTop: '4px' }}>{prob}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '16px 28px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: '14px', color: '#94a3b8', textTransform: 'uppercase' }}>Audited Outcome</span>
            <span style={{ fontSize: '28px', fontWeight: 700, color: verdictColor, marginTop: '4px' }}>{actualText}</span>
          </div>
        </div>

        <span style={{ fontSize: '16px', color: '#64748b', marginTop: '36px' }}>
          Frozen serve-time snapshot · {model} · cinepulse.app
        </span>
      </div>
    ),
    {
      ...size,
    }
  );
}
