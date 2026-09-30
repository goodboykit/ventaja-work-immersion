export function formatMoney(amount: number | string, currency: string): string {
  const value = Number(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

// Invoice dates are plain calendar dates ("2026-09-30"), so they must not shift with the time zone.
export function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDuration(milliseconds: number): string {
  return milliseconds < 1000 ? `${milliseconds} ms` : `${(milliseconds / 1000).toFixed(1)} s`;
}

// "in 30 s", "in 4 min", "any moment now"
export function formatTimeUntil(timestamp: string, now = Date.now()): string {
  const seconds = Math.round((new Date(timestamp).getTime() - now) / 1000);
  if (Number.isNaN(seconds) || seconds <= 1) return "any moment now";
  if (seconds < 60) return `in ${seconds} s`;
  if (seconds < 3600) return `in ${Math.round(seconds / 60)} min`;
  return `in ${Math.round(seconds / 3600)} h`;
}

// Today's date in the user's own time zone, as YYYY-MM-DD.
export function todayIsoDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function initialsFromEmail(email: string | null): string {
  const name = (email ?? "").split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2);
  return letters.toUpperCase() || "?";
}
