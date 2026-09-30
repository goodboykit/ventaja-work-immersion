import type { AuditEvent, AuditEventType } from "../domain/audit.ts";

export interface NewAuditEvent {
  companyId: string;
  actorUserId: string | null;
  eventType: AuditEventType;
  summary: string;
  metadata?: Record<string, unknown>;
}

// The audit trail store. Recording never blocks the main action (best-effort).
export interface AuditRepository {
  record(event: NewAuditEvent): Promise<void>;
  list(companyId: string, from: string | null, to: string | null, limit: number): Promise<AuditEvent[]>;
}
