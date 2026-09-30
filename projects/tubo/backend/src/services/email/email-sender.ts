// How Tubo sends an email. The invite flow depends on this interface, not a specific provider,
// so the real transport (Resend, SMTP, SES, …) can be swapped in without touching any other code —
// the same dependency-injection pattern used for the government client.
export interface InviteEmail {
  to: string;
  companyName: string;
  acceptUrl: string;
}

export interface ReportEmail {
  to: string;
  subject: string;
  intro: string;          // formal opening sentence
  lines: string[];        // formal summary lines (label: value)
  viewUrl: string;        // link back to view/print the full report
}

export interface EmailSender {
  sendInvite(email: InviteEmail): Promise<void>;
  sendReport(email: ReportEmail): Promise<void>;
}
