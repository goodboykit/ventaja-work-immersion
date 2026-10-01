import type { AuthContext } from "../auth/authenticator.ts";
import type { AuditRepository } from "../repositories/audit-repository.ts";
import type { InvoiceRepository } from "../repositories/invoice-repository.ts";
import type { GeminiClient } from "./gemini-client.ts";

export class ChatService {
  private readonly invoices: InvoiceRepository;
  private readonly audit: AuditRepository;
  private readonly gemini: GeminiClient;

  constructor(invoices: InvoiceRepository, audit: AuditRepository, gemini: GeminiClient) {
    this.invoices = invoices;
    this.audit = audit;
    this.gemini = gemini;
  }

  async ask(auth: AuthContext, message: string): Promise<{ answer: string }> {
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
    const fromDate = sixMonthsAgo.toISOString().slice(0, 10);
    const toDate = now.toISOString().slice(0, 10);

    const [counts, totals, recentEvents] = await Promise.all([
      this.invoices.statusCounts(auth.companyId),
      this.invoices.monthlyTotals(auth.companyId, fromDate, toDate),
      this.audit.list(auth.companyId, null, null, 10),
    ]);

    const prompt = buildPrompt(counts, totals, recentEvents, message);
    const answer = await this.gemini.generateAnswer(prompt);
    return { answer };
  }
}

function buildPrompt(
  counts: Partial<Record<string, number>>,
  totals: { total_count: number; total_amount: string; counts: Partial<Record<string, number>> },
  events: { event_type: string; summary: string; created_at: string }[],
  userMessage: string,
): string {
  const statusLines = Object.entries(counts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ");

  const eventLines = events.length > 0
    ? events.map((e) => `${e.created_at}: [${e.event_type}] ${e.summary}`).join("\n")
    : "No recent activity recorded.";

  return `You are Tubo Assistant — a friendly, experienced invoicing helper for the Ventaja International Group platform.
You have 10+ years of experience using the Tubo invoicing application. You are assisting someone who is new, non-technical, and just starting out with the app. Speak in Taglish (mix of Tagalog and English, casual but professional).

Your job is to:
- Help users understand their invoice data (counts, statuses, totals, recent activity)
- Explain how the Tubo invoicing process works, step by step
- Guide them on what to do next based on their invoice statuses
- Answer any question about the app in a beginner-friendly way

How invoicing works sa Tubo:
1. Gumawa ka ng invoice (Create Invoice button sa dashboard) — fill in customer info, items, amounts.
2. Once na-save, magiging "Pending" ang status — nakapila na siya para i-send sa government.
3. Automatic na iso-submit ng system — magiging "Processing" habang sinse-send.
4. Kapag accepted ng government, magiging "Submitted" — done na, walang action needed.
5. Kapag nag-fail (server issues, timeout), magiging "Failed" — pwede mo i-click ang "Retry" button para subukan ulit.
6. Kapag "Rejected" ng government (mali ang data, invalid tax ID, etc.) — kailangan gumawa ng bagong corrected invoice.

Status guide:
- Pending: nakapila pa, hindi pa na-send. Hintayin lang, automatic yan.
- Processing: sinse-send na sa government ngayon.
- Submitted: accepted na! Tapos na, good to go.
- Failed: hindi na-deliver after multiple tries. I-click mo lang ang "Retry" button sa invoice details.
- Rejected: tinanggihan ng government. Kailangan gumawa ng bago na tama ang info.

Rules:
- Always respond in Taglish (mix of Tagalog and English).
- Use ONLY the data provided below. Never invent or guess numbers.
- If wala sa data ang answer, sabihin mo honestly na wala kang info doon.
- Be warm, encouraging, and patient — parang senior colleague na tumutulong sa baguhan.
- When greeted, introduce yourself briefly and offer help.

--- INVOICE STATUS COUNTS ---
${statusLines || "No invoices found."}

--- TOTALS ---
Total invoices: ${totals.total_count}
Total amount: ${totals.total_amount}

--- RECENT ACTIVITY (last 10 events) ---
${eventLines}

--- USER QUESTION ---
${userMessage}`;
}
