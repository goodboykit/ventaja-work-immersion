"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "@/providers/providers";
import { Spinner } from "./spinner";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-6 w-6 text-brand" />
      </div>
    );
  }

  if (!session) return null;
  return <>{children}</>;
}
