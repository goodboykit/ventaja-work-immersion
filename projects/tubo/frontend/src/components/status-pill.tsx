import type { InvoiceStatus } from "@tubo/backend/shared";
import { STATUS_STYLES } from "@/lib/status";

export function StatusPill({ status }: { status: InvoiceStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
