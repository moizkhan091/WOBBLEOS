"use client";

import { useParams } from "next/navigation";
import { ModuleContent } from "@/components/os/os-ui";

export default function ModulePage() {
  const params = useParams<{ module: string }>();
  const id = typeof params.module === "string" ? params.module : Array.isArray(params.module) ? params.module[0] : "command";
  return <ModuleContent id={id} />;
}
