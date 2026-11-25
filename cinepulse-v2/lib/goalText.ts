/** Milestone wording, shared by the server and the notification bell (no database imports). */
/** Human text for a milestone notification's target id ("2026:count:25" / "2026:goal:52"). */
export function milestoneText(targetId: string | null | undefined): string {
  const [year, kind, n] = String(targetId || '').split(':');
  if (kind === 'goal') return `You hit your ${year} goal of ${n} titles. Take a bow.`;
  if (kind === 'count') return `${n} titles watched in ${year}. Keep it rolling.`;
  return 'You reached a new milestone.';
}
