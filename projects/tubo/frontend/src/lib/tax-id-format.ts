export function formatTaxId(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, 12);
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 3) {
    groups.push(digits.slice(i, i + 3));
  }
  return groups.join("-");
}

export function completeTaxId(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, 12);
  if (digits.length < 9) return formatTaxId(raw);
  const first9 = digits.slice(0, 9);
  const fourth = digits.length > 9 ? digits.slice(9).padEnd(3, "0") : "000";
  const groups: string[] = [];
  for (let i = 0; i < first9.length; i += 3) {
    groups.push(first9.slice(i, i + 3));
  }
  groups.push(fourth);
  return groups.join("-");
}
