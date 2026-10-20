"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/data";

export interface AuthState {
  error?: string;
}

function safeMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/already (registered|been registered)/i.test(msg)) {
    return "An account with this email already exists.";
  }
  if (/email address .*invalid|invalid email|unable to validate email/i.test(msg)) {
    return "Email itu ditolak oleh Supabase. Pakai email asli (mis. Gmail), bukan domain karangan.";
  }
  if (/signups? not allowed|signup is disabled/i.test(msg)) {
    return "Pendaftaran dinonaktifkan di project Supabase ini.";
  }
  if (/email_provider_disabled|email logins? (are|is) disabled/i.test(msg)) {
    return "Login email dimatikan di Supabase. Aktifkan Authentication → Providers → Email.";
  }
  if (/database error saving new user/i.test(msg)) {
    return "Supabase gagal menyimpan user baru. Cek log Auth di dashboard.";
  }
  if (/password/i.test(msg)) return "Password must be at least 8 characters.";
  if (/invalid (login|credential)|email not confirmed/i.test(msg)) {
    return "Email atau password salah, atau email belum dikonfirmasi.";
  }
  return "Something went wrong. Please try again.";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (isDemoMode) {
    return { error: "Demo mode is active — configure Supabase to enable sign in." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: safeMessage(error) };

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (isDemoMode) {
    return { error: "Demo mode is active — configure Supabase to enable sign up." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const studioName = String(formData.get("studioName") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();

  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (!studioName) return { error: "Studio name is required." };
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
    return { error: "Slug must be 3–40 chars: lowercase letters, numbers, hyphens." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: safeMessage(error) };
  if (!data.user) return { error: "Account creation failed. Please try again." };

  // With "Confirm email" enabled Supabase returns a user but no session, and
  // provision_tenant needs an authenticated caller. Tell the user what to do
  // instead of surfacing a confusing RPC error.
  if (!data.session) {
    return {
      error:
        "Akun dibuat, tapi project ini masih mewajibkan konfirmasi email. Cek inbox, klik link konfirmasi, lalu masuk.",
    };
  }

  const { error: provisionError } = await supabase.rpc("provision_tenant", {
    p_studio_name: studioName,
    p_slug: slug,
  });
  if (provisionError) return { error: safeMessage(provisionError) };

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  if (isDemoMode) redirect("/");
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
