"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Dashboard } from "@/components/dashboard";
import { Spinner } from "@/components/spinner";
import { ApiError } from "@/lib/api-client";
import { useApp } from "@/providers/providers";

export default function HomePage() {
  return (
    <AuthGuard>
      <CompanyGate />
    </AuthGuard>
  );
}

function CompanyGate() {
  const { api } = useApp();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.getMe().then((profile) => {
      if (!profile.company) {
        router.replace("/setup");
      } else {
        setReady(true);
      }
    }).catch((err) => {
      if (err instanceof ApiError && err.code === "no_company") {
        router.replace("/setup");
      } else if (err instanceof ApiError && err.code === "forbidden") {
        router.replace("/setup");
      }
    });
  }, [api, router]);

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-6 w-6 text-brand" />
      </div>
    );
  }

  return <Dashboard />;
}
