import type { EmailSender, InviteEmail } from "./email-sender.ts";

// Sends real email through Resend (https://resend.com) using its HTTP API — no SDK dependency,
// so it stays lightweight and runs the same on every platform. It implements the same EmailSender
// interface as the console sender, so nothing else in the app changes.
//
// Configure with two environment variables:
//   RESEND_API_KEY   — your Resend API key (server-side only; never NEXT_PUBLIC_)
//   EMAIL_FROM        — a verified sender, e.g. "Tubo <invites@yourdomain.com>"
//                       (defaults to Resend's shared testing sender if unset)
export class ResendEmailSender implements EmailSender {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(apiKey: string, from = "Tubo <onboarding@resend.dev>") {
    this.apiKey = apiKey;
    this.from = from;
  }

  async sendInvite(email: InviteEmail): Promise<void> {
    const subject = `You have been invited to join ${email.companyName} on Tubo`;

    // Formal, plain wording — written for a non-technical business reader.
    const text = [
      `Hello,`,
      ``,
      `You have been invited to join ${email.companyName} on Tubo, the invoicing platform.`,
      `To accept this invitation and set up your access, please open the link below:`,
      ``,
      email.acceptUrl,
      ``,
      `This invitation is valid for 7 days. If you were not expecting it, you may disregard this message.`,
      ``,
      `Kind regards,`,
      `The ${email.companyName} team`,
    ].join("\n");

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #1e293b; line-height: 1.6;">
        <p>Hello,</p>
        <p>You have been invited to join <strong>${escapeHtml(email.companyName)}</strong> on Tubo, the invoicing platform.</p>
        <p>To accept this invitation and set up your access, please use the button below:</p>
        <p style="margin: 24px 0;">
          <a href="${escapeHtml(email.acceptUrl)}"
             style="background:#1e293b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;">
            Accept invitation
          </a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Or copy this link into your browser:<br>${escapeHtml(email.acceptUrl)}</p>
        <p style="font-size: 13px; color: #64748b;">This invitation is valid for 7 days. If you were not expecting it, you may disregard this message.</p>
      </div>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: this.from, to: email.to, subject, text, html }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend failed to send the invite (HTTP ${response.status}): ${detail}`);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
