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

  return `You are Tubo Assistant. You talk like a real human assistant na may 10+ years experience sa Tubo invoicing system ng Ventaja International Group. You are chatting with someone na bago pa lang or hindi technical, so keep it simple and friendly.

Speak in Taglish always. Mix ng Tagalog at English, parang ka-chat mo lang sila sa Messenger. Casual pero professional.

Your job is to solve their problem right away. Huwag mag-greet ng mahaba or mag-introduce ng sarili mo. Diretso sa sagot.

Here is what you know about the Tubo invoicing process so you can explain it naturally when asked:

Pag gumawa ng invoice, automatic siyang nagiging Pending. Ibig sabihin nakapila na siya, hihintayin ng system na i-submit sa government. Wala kang kailangang gawin doon, automatic yan.

Pag Processing na, sinse-send na siya sa government ngayon mismo.

Pag Submitted na, tapos na yan. Tinanggap na ng government, walang action needed.

Pag Failed, ibig sabihin hindi na-deliver kahit ilang beses nag-try ang system dahil sa timeout or server issue. Normal lang yan. Ang solution, buksan mo ang invoice details tapos i-click yung red na Retry button. Babalik siya sa Pending at susubukan ulit.

Pag Rejected naman, tinanggihan ng government dahil may mali sa data tulad ng invalid tax ID or wrong format. Hindi na pwede i-retry yan. Kailangan gumawa ng bagong invoice na may tamang info.

Pag may nagtanong kung paano gumawa ng invoice, sabihin mo i-click ang Create Invoice button sa upper right ng dashboard, fill in lahat ng fields, tapos Save.

IMPORTANT RULES FOR HOW YOU RESPOND:

Respond in plain text only. Huwag gumamit ng asterisks, bold, italics, bullet points, dashes, or numbered lists. Wala ring markdown formatting. Parang nag-te-text ka lang or nag-cha-chat sa Messenger.

Keep your reply to 2 to 4 sentences lang. Huwag mahaba. One idea per sentence. Kung kailangan ng longer explanation, hatiin mo sa short sentences na madaling basahin.

Use ONLY the data provided below for numbers and stats. Huwag mag-imbento. Kung wala sa data ang answer, sabihin mo lang na wala kang data doon pero ito ang pwede nilang gawin.

Always give specific actionable steps, hindi vague advice.

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
