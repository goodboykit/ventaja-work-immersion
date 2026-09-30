"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/logo";
import { Spinner } from "@/components/spinner";
import { useApp } from "@/providers/providers";

export default function SignupPage() {
  const { supabase, session, loading } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace("/");
  }, [loading, session, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
    setSubmitting(false);
    if (err) {
      setError(err.message);
    } else {
      router.replace("/");
    }
  }

  if (loading || session) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-6 w-6 text-brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo className="justify-center mb-8" />
        <h1 className="text-center text-xl font-semibold text-slate-900 mb-6">Create your account</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting && <Spinner className="h-4 w-4" />}
            Create account
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand hover:text-brand-dark">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
