export function formatInvoiceNumber(raw: string): string {
  const upper = raw.toUpperCase();
  const letters = upper.replace(/[^A-Z]/g, "").slice(0, 3);
  const rest = upper.slice(raw.search(/[^A-Za-z-]/) === -1 ? raw.length : raw.search(/[^A-Za-z-]/));
  const digits = rest.replace(/[^0-9]/g, "").slice(0, 20);

  if (letters.length < 3) return letters;
  if (digits.length === 0) return `${letters}-`;
  return `${letters}-${digits}`;
}
