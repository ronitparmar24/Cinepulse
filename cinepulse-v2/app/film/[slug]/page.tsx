import type { Metadata } from 'next';
import { TitlePage, titleMetadata } from '@/components/TitlePage';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return titleMetadata('film', (await params).slug);
}

export default async function FilmPage({ params }: Props) {
  return <TitlePage kind="film" slug={(await params).slug} />;
}
