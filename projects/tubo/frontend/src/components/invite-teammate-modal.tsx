"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";
import { ApiError, type Invitation } from "@/lib/api-client";
import { useApp } from "@/providers/providers";

// Lets a user who has a company invite teammates by email. The mock email sender does not send
// a real email, so we also show the accept link here so it can be copied and shared directly.
export function InviteTeammateModal({ onClose }: { onClose: () => void }) {
  const { api } = useApp();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<Invitation[]>([]);

  useEffect(() => {
    api.listInvitations().then(setPending).catch(() => setPending([]));
  }, [api]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await api.inviteTeammate(email.trim());
      setLastLink(result.acceptUrl);
      toast("success", `Invite created for ${result.email}`);
      setEmail("");
      api.listInvitations().then(setPending).catch(() => {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the invite.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!lastLink) return;
    try {
      await navigator.clipboard.writeText(lastLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select the text */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Invite a teammate</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleInvite} className="space-y-3">
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-slate-700 mb-1">Their email</label>
            <input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              placeholder="teammate@example.com" />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="submit" disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-dark disabled:opacity-60">
            {submitting && <Spinner className="h-4 w-4" />}
            Send invite
          </button>
        </form>

        {lastLink && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-1 text-xs font-medium text-slate-500">Invite link (share this with your teammate)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs text-slate-700 border border-slate-200">{lastLink}</code>
              <button onClick={copyLink} className="flex items-center gap-1 rounded-lg bg-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {pending.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-500">Pending invites</p>
            <ul className="space-y-1">
              {pending.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <span className="text-slate-700">{inv.email}</span>
                  <span className="text-xs text-slate-400">pending</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
