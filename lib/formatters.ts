/**
 * Format a daysUntilDue integer into a human-readable label.
 *
 * Examples:
 *   undefined → ''
 *   0         → 'Due today'
 *   1         → 'Due tomorrow'
 *   -3        → 'overdue 3d'
 *   42        → 'in 42 days'
 *   400       → 'in 1+ year'
 *   -400      → 'overdue 1+ year'
 */
export function formatDaysUntilDue(days?: number): string {
  if (days === undefined || Number.isNaN(days)) return '';
  if (Math.abs(days) > 365) return days > 0 ? 'in 1+ year' : 'overdue 1+ year';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 0) return `overdue ${Math.abs(days)}d`;
  return `in ${days} days`;
}

export function daysUntilDueColorClass(days?: number): string {
  if (days === undefined || Number.isNaN(days)) return 'text-gray-600';
  if (days < 0) return 'text-red-600';
  if (days === 0) return 'text-orange-600';
  if (days <= 7) return 'text-yellow-600';
  return 'text-gray-600';
}
