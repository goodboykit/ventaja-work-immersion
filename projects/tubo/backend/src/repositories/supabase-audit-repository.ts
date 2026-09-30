import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent } from "../domain/audit.ts";
import type { AuditRepository, NewAuditEvent } from "./audit-repository.ts";

export class SupabaseAuditRepository implements AuditRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  // Best-effort: an audit failure must never break the business action that triggered it.
  async record(event: NewAuditEvent): Promise<void> {
    const { error } = await this.db.rpc("record_audit_event", {
      p_company_id: event.companyId,
      p_actor: event.actorUserId,
      p_event_type: event.eventType,
      p_summary: event.summary,
      p_metadata: event.metadata ?? {},
    });
    if (error) console.error(`record_audit_event failed (${event.eventType}):`, error.message);
  }

  async list(companyId: string, from: string | null, to: string | null, limit: number): Promise<AuditEvent[]> {
    const { data, error } = await this.db.rpc("list_audit_events", {
      p_company_id: companyId,
      p_from: from,
      p_to: to,
      p_limit: limit,
    });
    if (error) throw new Error(`Database error: ${error.message}`);
    return (data ?? []) as AuditEvent[];
  }
}
