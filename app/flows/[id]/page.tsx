"use client";

import { useParams } from "next/navigation";
import { OpenFlow } from "@/components/open-flow";

export default function FlowPage() {
  const { id } = useParams<{ id: string }>();
  return <OpenFlow id={id} />;
}
