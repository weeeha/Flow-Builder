"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { installDebugHook } from "@/lib/flows/debug-hook";
import { importLegacyFlow } from "@/lib/flows/legacy";
import { listFlows } from "@/lib/flows/repo";

/**
 * Temporary until the home page lands (flow documents plan, task 8): carry the
 * old flow over, then open the newest flow, or a new one.
 */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    installDebugHook();
    (async () => {
      await importLegacyFlow();
      const [newest] = await listFlows();
      router.replace(newest ? `/flows/${newest.id}` : "/flows/new");
    })();
  }, [router]);
  return <main className="h-dvh" />;
}
