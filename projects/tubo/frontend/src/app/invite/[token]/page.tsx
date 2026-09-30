"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Logo } from "@/components/logo";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";
import { ApiError } from "@/lib/api-client";
import { useApp } from "@/providers/providers";

// The page an invited teammate lands on from their email link: /invite/<token>.
// AuthGuard makes them sign in first; then we accept the invite and send them to the dashboard.
export default function InvitePage() {
  return (
    <AuthGuard>
      <AcceptInvite />
    </AuthGuard>
  );
}

function AcceptInvite() {
  const { api } = useApp();
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const { toast } = useToast();
  const [error, setError] = useState("");
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const token = Array.isArray(params.token) ? params.token[0] : params.token;
    if (!token) {
      setError("This invite link is missing its code.");
      return;
    }
    api.acceptInvite(token)
      .then((company) => {
        toast("success", `Joined ${company.name}!`);
        router.replace("/");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === "already_in_company") {
          // Already set up — just go to the dashboard.
          router.replace("/");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not accept this invite.");
      });
  }, [api, params, router, toast]);

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <Logo className="justify-center mb-8" />
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900 mb-2">Invite problem</h1>
            <p className="text-sm text-rose-600 mb-6">{error}</p>
            <button onClick={() => router.replace("/setup")}
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-dark">
              Go to setup
            </button>
          </>
        ) : (
          <>
            <Spinner className="mx-auto h-6 w-6 text-brand" />
            <p className="mt-4 text-sm text-slate-500">Joining your company…</p>
          </>
        )}
      </div>
    </div>
  );
}
