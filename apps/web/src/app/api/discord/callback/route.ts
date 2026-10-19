import { NextResponse } from "next/server";

import { createClient, getAuthSession } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface DiscordTokenResponse {
  access_token?: string;
  guild?: { id?: string };
}

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  // Demo/local mode: no Discord app configured.
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/settings?discord=unconfigured`);
  }

  const searchParams = new URL(request.url).searchParams;
  const code = searchParams.get("code");
  const queryGuildId = searchParams.get("guild_id");

  if (!code) {
    return NextResponse.redirect(`${appUrl}/settings?discord=error`);
  }

  const supabase = await createClient().catch(() => null);
  if (!supabase) {
    return NextResponse.redirect(`${appUrl}/login?next=/onboarding`);
  }

  const session = await getAuthSession(supabase);
  if (!session || !session.tenantId) {
    return NextResponse.redirect(`${appUrl}/login?next=/onboarding`);
  }

  let token: DiscordTokenResponse;
  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appUrl}/api/discord/callback`,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.redirect(`${appUrl}/settings?discord=error`);
    }

    token = (await response.json()) as DiscordTokenResponse;
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?discord=error`);
  }

  const guildId = token.guild?.id ?? queryGuildId;
  if (!guildId) {
    return NextResponse.redirect(`${appUrl}/settings?discord=error`);
  }

  const { error } = await supabase
    .from("tenants")
    .update({ discord_guild_id: guildId })
    .eq("id", session.tenantId);

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return NextResponse.redirect(`${appUrl}/settings?discord=taken`);
    }
    return NextResponse.redirect(`${appUrl}/settings?discord=error`);
  }

  return NextResponse.redirect(`${appUrl}/onboarding?discord=connected`);
}
