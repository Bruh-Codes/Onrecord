"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "@/lib/hooks/use-business";

export function ShellGate({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !me?.business_id) {
      router.replace("/onboarding");
    }
  }, [isLoading, me?.business_id, router]);

  if (isLoading || !me?.business_id) {
    return (
      <div className="flex-1 min-w-0 h-screen flex items-center justify-center text-sm opacity-60">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}