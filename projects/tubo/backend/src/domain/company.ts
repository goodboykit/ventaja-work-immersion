export interface Company {
  id: string;
  name: string;
  tax_id: string;
}

export interface Profile {
  user: { id: string; email: string | null };
  company: Company | null;
}
