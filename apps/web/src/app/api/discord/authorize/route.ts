import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Demo mode (no Discord app configured): bounce back to settings with a flag.
  if (!clientId) {
    return NextResponse.redirect(`${appUrl}/settings?discord=unconfigured`);
  }

  const redirectUri = `${appUrl}/api/discord/callback`;
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "bot identify guilds");
  // Base permissions for thread + message + history access; tune per deployment.
  url.searchParams.set("permissions", "3435973888");

  return NextResponse.redirect(url.toString());
}
