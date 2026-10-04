import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getForecastReceiptById } from '@/lib/receipts';
import Cinepulse from '@/components/Cinepulse';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const receipt = getForecastReceiptById(id);
  if (!receipt) {
    return { title: 'Forecast Receipt Not Found | CinePulse' };
  }

  const verdictLabel = receipt.verdict === 'called' ? 'Called it ✅' : 'Missed ❌';
  return {
    title: `${receipt.titleName} — ${verdictLabel} | CinePulse Receipts`,
    description: `Audited prediction receipt for ${receipt.titleName}. Predicted ${receipt.predictedProbability}% Hit by ${receipt.modelVersion}. Verdict: ${verdictLabel}.`,
    openGraph: {
      title: `${receipt.titleName} — ${verdictLabel}`,
      description: `Audited prediction receipt for ${receipt.titleName}. Verdict: ${verdictLabel}.`,
    },
  };
}

export default async function ReceiptPermalinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const receipt = getForecastReceiptById(id);
  if (!receipt) {
    notFound();
  }

  return <Cinepulse initialView="receipts" initialTitleId={receipt.titleId} />;
}
