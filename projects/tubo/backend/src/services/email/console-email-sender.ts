import type { EmailSender, InviteEmail, ReportEmail } from "./email-sender.ts";

// The default sender for development and this assessment: it does not send a real email,
// it logs the invitation so the whole flow can be demonstrated without an email service.
// The accept URL is also returned to the caller (see CompanyService.invite), so the UI can
// show it directly. Swap in a real EmailSender (Resend/SMTP) in index.ts for production.
export class ConsoleEmailSender implements EmailSender {
  async sendInvite(email: InviteEmail): Promise<void> {
    console.log(
      `[email:invite] to=${email.to} company="${email.companyName}" accept=${email.acceptUrl}`,
    );
  }

  async sendReport(email: ReportEmail): Promise<void> {
    console.log(`[email:report] to=${email.to} subject="${email.subject}" view=${email.viewUrl}`);
  }
}
