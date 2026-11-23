import type { Metadata } from 'next';
import { TitlePage, titleMetadata } from '@/components/TitlePage';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return titleMetadata('tv', (await params).slug);
}

export default async function TvPage({ params }: Props) {
  return <TitlePage kind="tv" slug={(await params).slug} />;
}
