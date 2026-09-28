"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { installDebugHook } from "@/lib/flows/debug-hook";
import { createFlow } from "@/lib/flows/repo";

/** New flow: create it, then open it. replace() keeps /flows/new out of history. */
export default function NewFlowPage() {
  const router = useRouter();
  useEffect(() => {
    installDebugHook();
    createFlow().then((file) => router.replace(`/flows/${file.id}`));
  }, [router]);
  return <main className="h-dvh" />;
}
