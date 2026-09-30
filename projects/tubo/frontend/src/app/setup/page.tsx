"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/logo";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";
import { ApiError } from "@/lib/api-client";
import { formatTaxId } from "@/lib/tax-id-format";
import { useApp } from "@/providers/providers";

export default function SetupPage() {
  const { api } = useApp();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.registerCompany(name.trim(), taxId.trim());
      toast("success", "Company registered!");
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo className="justify-center mb-8" />
        <h1 className="text-center text-xl font-semibold text-slate-900 mb-2">Register your company</h1>
        <p className="text-center text-sm text-slate-500 mb-6">Before creating invoices, tell us about your business.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Company name</label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              placeholder="Ventaja International Group"
            />
          </div>
          <div>
            <label htmlFor="taxId" className="block text-sm font-medium text-slate-700 mb-1">Tax ID</label>
            <input
              id="taxId"
              type="text"
              required
              value={taxId}
              onChange={(e) => setTaxId(formatTaxId(e.target.value))}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              placeholder="123-456-789-000"
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting && <Spinner className="h-4 w-4" />}
            Register company
          </button>
        </form>
      </div>
    </div>
  );
}
