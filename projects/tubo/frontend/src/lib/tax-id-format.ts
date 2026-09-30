export function formatTaxId(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, 15);
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 3) {
    groups.push(digits.slice(i, i + 3));
  }
  return groups.join("-");
}
