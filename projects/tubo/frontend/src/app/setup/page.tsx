"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/logo";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";
import { ApiError } from "@/lib/api-client";
import { formatTaxId } from "@/lib/tax-id-format";
import { useApp } from "@/providers/providers";

type Tab = "create" | "join";

export default function SetupPage() {
  const { api } = useApp();
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("create");

  // Create-company form
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  // Join-company form
  const [token, setToken] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.registerCompany(name.trim(), taxId.trim());
      toast("success", "Company registered!");
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      // Accept a raw token, or a full /invite/<token> link pasted in.
      const value = token.trim();
      const code = value.includes("/invite/") ? value.split("/invite/")[1]!.split(/[?#]/)[0] : value;
      const company = await api.acceptInvite(code);
      toast("success", `Joined ${company.name}!`);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setError("");
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
      active ? "bg-brand text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;
  const inputClass =
    "block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none";

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo className="justify-center mb-8" />
        <h1 className="text-center text-xl font-semibold text-slate-900 mb-2">Get started</h1>
        <p className="text-center text-sm text-slate-500 mb-6">
          Create a new company, or join one you were invited to.
        </p>

        <div className="mb-5 flex gap-2">
          <button type="button" className={tabClass(tab === "create")} onClick={() => switchTab("create")}>
            Create a company
          </button>
          <button type="button" className={tabClass(tab === "join")} onClick={() => switchTab("join")}>
            Join with a code
          </button>
        </div>

        {tab === "create" ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Company name</label>
              <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)}
                className={inputClass} placeholder="Ventaja International Group" />
            </div>
            <div>
              <label htmlFor="taxId" className="block text-sm font-medium text-slate-700 mb-1">Tax ID</label>
              <input id="taxId" type="text" required value={taxId}
                onChange={(e) => setTaxId(formatTaxId(e.target.value))} className={inputClass}
                placeholder="123-456-789-000" />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-dark disabled:opacity-60">
              {submitting && <Spinner className="h-4 w-4" />}
              Register company
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-slate-700 mb-1">Invite code or link</label>
              <input id="token" type="text" required value={token} onChange={(e) => setToken(e.target.value)}
                className={inputClass} placeholder="Paste the code from your invite" />
              <p className="mt-1 text-xs text-slate-400">Your teammate sent this to you by email.</p>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-dark disabled:opacity-60">
              {submitting && <Spinner className="h-4 w-4" />}
              Join company
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
