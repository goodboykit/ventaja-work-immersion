"use client";

import { X, Plus, Trash2 } from "lucide-react";
import { useCallback, useId, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import { CURRENCIES } from "@/lib/currencies";
import { formatMoney, todayIsoDate } from "@/lib/format";
import { IdempotencyKeyStore } from "@/lib/idempotency-key";
import { checkForm, emptyForm, errorsFromDetails, liveTotals, newItem, toRequestBody, type FieldErrors, type InvoiceFormValues } from "@/lib/invoice-form";
import { formatTaxId } from "@/lib/tax-id-format";
import { useApp } from "@/providers/providers";
import { useToast } from "./toast";
import { Spinner } from "./spinner";

interface CreateInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const keyStore = new IdempotencyKeyStore();

export function CreateInvoiceModal({ open, onClose, onCreated }: CreateInvoiceModalProps) {
  const prefix = useId();
  const { api } = useApp();
  const { toast } = useToast();
  const [values, setValues] = useState<InvoiceFormValues>(() => emptyForm(todayIsoDate(), `${prefix}-0`));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  let itemCounter = values.items.length;

  const set = useCallback(<K extends keyof InvoiceFormValues>(field: K, value: InvoiceFormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const setItem = useCallback((index: number, field: string, value: string) => {
    setValues((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
    setErrors((prev) => {
      const key = `items.${index}.${field}`;
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const addItem = useCallback(() => {
    setValues((prev) => ({ ...prev, items: [...prev.items, newItem(`${prefix}-${++itemCounter}`)] }));
  }, [prefix]);

  const removeItem = useCallback((index: number) => {
    setValues((prev) => {
      const items = prev.items.filter((_, i) => i !== index);
      return { ...prev, items: items.length === 0 ? [newItem(`${prefix}-${++itemCounter}`)] : items };
    });
  }, [prefix]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const check = checkForm(values);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const body = toRequestBody(values);
      const key = keyStore.keyFor(body);
      const result = await api.createInvoice(body, key);
      keyStore.clear();
      toast("success", result.replayed ? "Invoice already exists (same data)." : "Invoice created and queued for submission!");
      setValues(emptyForm(todayIsoDate(), `${prefix}-${++itemCounter}`));
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setErrors(errorsFromDetails(err.details));
      } else if (err instanceof ApiError) {
        toast("error", err.message);
      } else {
        toast("error", "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const totals = liveTotals(values);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8 sm:pt-12">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Create New Invoice</h2>
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">Tubo Billing</span>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {errors.form && <p className="text-sm text-rose-600">{errors.form}</p>}

          {/* Section 1: Customer Information */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">1. Customer Information</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Customer / Company Name" required error={errors.customer_name}>
                <input type="text" value={values.customer_name} onChange={(e) => set("customer_name", e.target.value)}
                  className={fieldClass(errors.customer_name)} placeholder="e.g. Acme Corporation" />
              </Field>
              <Field label="Customer Email" required error={errors.customer_email}>
                <input type="email" value={values.customer_email} onChange={(e) => set("customer_email", e.target.value)}
                  className={fieldClass(errors.customer_email)} placeholder="billing@company.com" />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Customer Tax ID" required error={errors.customer_tax_id}>
                <input type="text" value={values.customer_tax_id} onChange={(e) => set("customer_tax_id", formatTaxId(e.target.value))}
                  className={fieldClass(errors.customer_tax_id)} placeholder="123-456-789-000" />
              </Field>
            </div>
          </section>

          {/* Section 2: Dates & Reference */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">2. Dates &amp; Reference</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Invoice Number" required error={errors.invoice_number}>
                <input type="text" value={values.invoice_number} onChange={(e) => set("invoice_number", e.target.value)}
                  className={fieldClass(errors.invoice_number)} placeholder="INV-2026-001" />
              </Field>
              <Field label="Invoice Date" required error={errors.invoice_date}>
                <input type="date" value={values.invoice_date} onChange={(e) => set("invoice_date", e.target.value)}
                  className={fieldClass(errors.invoice_date)} />
              </Field>
              <Field label="Currency" required error={errors.currency}>
                <select value={values.currency} onChange={(e) => set("currency", e.target.value)}
                  className={fieldClass(errors.currency)}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.name}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* Section 3: Line Items */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">3. Line Items <span className="text-rose-500">*</span></h3>
              <button type="button" onClick={addItem} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-dark">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>
            {errors.items && <p className="text-xs text-rose-600 mb-2">{errors.items}</p>}

            {/* Item header */}
            <div className="hidden sm:grid grid-cols-[1fr_80px_100px_80px_60px_32px] gap-2 mb-1 px-1">
              <span className="text-[11px] font-medium text-slate-400">Item Description</span>
              <span className="text-[11px] font-medium text-slate-400">Quantity</span>
              <span className="text-[11px] font-medium text-slate-400">Unit Price</span>
              <span className="text-[11px] font-medium text-slate-400">Tax</span>
              <span className="text-[11px] font-medium text-slate-400 text-right">Total</span>
              <span />
            </div>

            <div className="space-y-2">
              {values.items.map((item, i) => (
                <div key={item.key} className="grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_80px_60px_32px] gap-2 items-start rounded-lg border border-slate-100 p-2 sm:border-0 sm:p-0">
                  <div>
                    <input type="text" value={item.description} onChange={(e) => setItem(i, "description", e.target.value)}
                      className={fieldClass(errors[`items.${i}.description`])} placeholder="e.g. Software License, Consulting Services…" />
                    {errors[`items.${i}.description`] && <p className="text-[11px] text-rose-500 mt-0.5">{errors[`items.${i}.description`]}</p>}
                  </div>
                  <div>
                    <input type="number" min="1" step="1" value={item.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)}
                      className={`${fieldClass(errors[`items.${i}.quantity`])} text-center`} placeholder="1" />
                    {errors[`items.${i}.quantity`] && <p className="text-[11px] text-rose-500 mt-0.5">{errors[`items.${i}.quantity`]}</p>}
                  </div>
                  <div>
                    <input type="text" inputMode="decimal" value={item.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)}
                      className={fieldClass(errors[`items.${i}.unit_price`])} placeholder="0.00" />
                    {errors[`items.${i}.unit_price`] && <p className="text-[11px] text-rose-500 mt-0.5">{errors[`items.${i}.unit_price`]}</p>}
                  </div>
                  <div>
                    <input type="text" inputMode="decimal" value={item.tax} onChange={(e) => setItem(i, "tax", e.target.value)}
                      className={fieldClass(errors[`items.${i}.tax`])} placeholder="0.00" />
                    {errors[`items.${i}.tax`] && <p className="text-[11px] text-rose-500 mt-0.5">{errors[`items.${i}.tax`]}</p>}
                  </div>
                  <div className="text-right text-sm font-medium text-slate-700 pt-2">
                    {totals.lineTotals[i] ? formatMoney(totals.lineTotals[i], values.currency) : "—"}
                  </div>
                  <div className="pt-1.5">
                    <button type="button" onClick={() => removeItem(i)} className="p-1 text-slate-300 hover:text-rose-500 transition">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Totals */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-medium">{formatMoney(totals.subtotal, values.currency)}</span>
            </div>
            <div className="flex justify-between text-slate-600 mt-1">
              <span>Tax</span>
              <span className="font-medium">{formatMoney(totals.tax, values.currency)}</span>
            </div>
            <div className="flex justify-between text-slate-900 mt-2 pt-2 border-t border-slate-200">
              <span className="font-semibold">Total Amount Due</span>
              <span className="text-lg font-bold">{formatMoney(totals.total, values.currency)}</span>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="text-sm font-medium text-slate-500 hover:text-slate-700">
            Cancel
          </button>
          <button type="submit" disabled={submitting} onClick={handleSubmit}
            className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-dark disabled:opacity-60 transition">
            {submitting && <Spinner className="h-4 w-4" />}
            Create &amp; Submit Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, error, children }: { label?: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-rose-500 mt-0.5">{error}</p>}
    </div>
  );
}

function fieldClass(error?: string): string {
  return `block w-full rounded-lg border px-3 py-2 text-sm shadow-sm outline-none transition ${
    error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500" : "border-slate-300 focus:border-brand focus:ring-1 focus:ring-brand"
  }`;
}
