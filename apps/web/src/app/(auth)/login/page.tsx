import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "../actions";
import { isDemoMode } from "@/lib/data";

export const metadata: Metadata = { title: "Sign in — RobloxOps" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <AuthCard
      eyebrow="STUDIO ACCESS"
      title="Sign in to RobloxOps"
      subtitle="Manage commissions, agents and delivery from one pipeline."
      footer={
        <Link href="/" className="text-brand hover:underline">
          Continue in demo mode
        </Link>
      }
    >
      <AuthForm
        mode="login"
        action={signIn}
        isDemoMode={isDemoMode}
        next={next}
        submitLabel="Sign in"
        fields={[
          { name: "email", label: "Email", type: "email", placeholder: "you@studio.com", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", placeholder: "••••••••", autoComplete: "current-password" },
        ]}
      />
    </AuthCard>
  );
}
