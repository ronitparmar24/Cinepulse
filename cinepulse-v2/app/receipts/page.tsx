import type { Metadata } from 'next';
import Cinepulse from '@/components/Cinepulse';

export const metadata: Metadata = {
  title: 'Receipts & Public Track Record | CinePulse',
  description: 'Audited predictions log and public receipts. Every box-office call, hit or miss, published and verified.',
};

export default function ReceiptsPage() {
  return <Cinepulse initialView="receipts" />;
}
