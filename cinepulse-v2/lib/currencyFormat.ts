/**
 * Format USD amount to Indian Rupees in Crores, always annotated with the exchange rate date (Track M4).
 * Example output: "≈ ₹1,660 cr at 4 Oct 2026 rate"
 */
export function formatInrCrores(
  usdAmount: number | null | undefined,
  inrRate: number | null | undefined,
  rateDate: string
): string | null {
  if (!usdAmount || !inrRate || usdAmount <= 0 || inrRate <= 0) return null;
  const inrTotal = usdAmount * inrRate;
  const inrCrores = inrTotal / 10_000_000;
  const d = new Date(rateDate);
  const formattedDate = !isNaN(d.getTime())
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : rateDate;
  const formattedCrores = inrCrores >= 100
    ? Math.round(inrCrores).toLocaleString('en-IN')
    : inrCrores.toFixed(1);
  return `≈ ₹${formattedCrores} cr at ${formattedDate} rate`;
}
