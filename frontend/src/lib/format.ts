export function formatPaise(paise: number | string | null | undefined): string {
  if (paise === null || paise === undefined) return '–';
  const rupees = Number(paise) / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '–';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
