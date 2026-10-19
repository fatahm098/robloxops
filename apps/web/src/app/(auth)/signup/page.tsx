import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "../actions";
import { isDemoMode } from "@/lib/data";

export const metadata: Metadata = { title: "Create workspace — RobloxOps" };

export default function SignupPage() {
  return (
    <AuthCard
      eyebrow="NEW WORKSPACE"
      title="Create your studio workspace"
      subtitle="One workspace per studio. You'll be the owner."
      footer={
        <Link href="/" className="text-brand hover:underline">
          Continue in demo mode
        </Link>
      }
    >
      <AuthForm
        mode="signup"
        action={signUp}
        isDemoMode={isDemoMode}
        submitLabel="Create workspace"
        fields={[
          { name: "email", label: "Work email", type: "email", placeholder: "you@studio.com", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", placeholder: "At least 8 characters", autoComplete: "new-password" },
          { name: "studioName", label: "Studio name", placeholder: "Apex UGC Studio" },
          { name: "slug", label: "Workspace slug", placeholder: "apex-ugc" },
        ]}
      />
    </AuthCard>
  );
}
