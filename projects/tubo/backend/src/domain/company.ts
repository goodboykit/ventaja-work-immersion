export interface Company {
  id: string;
  name: string;
  tax_id: string;
}

export interface Profile {
  user: { id: string; email: string | null };
  company: Company | null;
}

// A pending team invitation shown on the "Invite teammates" screen.
export interface Invitation {
  id: string;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  created_at: string;
  expires_at: string;
}
