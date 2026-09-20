'use client';
import { use } from 'react';
import { ArrowLeft } from 'lucide-react';
import { TasteDnaView } from '@/components/TasteDnaView';

export default function StandaloneTasteDnaPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);

  return (
    <div className="section" style={{ minHeight: '85vh', maxWidth: '1200px', margin: '0 auto', paddingBottom: '60px' }}>
      <div style={{ marginBottom: '24px' }}>
        <a href={`/u/${username}`} className="text-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> Back to @{username}'s Profile
        </a>
      </div>

      <TasteDnaView username={username} />
    </div>
  );
}
