"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useViewMode } from "@/lib/view-mode";

/**
 * In designer mode the studio overview is too dense, so the root path lands on
 * the focused /today view instead. Developer mode keeps the full overview.
 */
export function DesignerGuard() {
  const { mode } = useViewMode();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (mode === "designer" && pathname === "/") {
      router.replace("/today");
    }
  }, [mode, pathname, router]);

  return null;
}
