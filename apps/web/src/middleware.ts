import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth/callback",
  "/api/stripe/webhook",
  "/api/orchestrator",
];

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const demoCookie = request.cookies.get("demo_mode")?.value === "true";
  const demoParam = request.nextUrl.searchParams.get("demo") === "true";

  // Demo mode: no Supabase configured, or demo_mode cookie/param present.
  if (!url || !anonKey || demoCookie || demoParam) {
    const res = NextResponse.next({ request });
    if (demoParam) {
      res.cookies.set("demo_mode", "true", { path: "/" });
    }
    return res;
  }

  const response = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // Read-only check; refreshed cookies are already applied to `response`.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
