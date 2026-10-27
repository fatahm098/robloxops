import { NextRequest, NextResponse } from "next/server";

const WORKER_URL = process.env.INTERNAL_WORKER_URL || "http://127.0.0.1:8080";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const endpoint = `/orchestrator/${path.join("/")}`;
  const url = new URL(request.url);
  const targetUrl = `${WORKER_URL}${endpoint}${url.search}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to connect to worker orchestrator", details: String(err) },
      { status: 502 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const endpoint = `/orchestrator/${path.join("/")}`;
  const targetUrl = `${WORKER_URL}${endpoint}`;

  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to connect to worker orchestrator", details: String(err) },
      { status: 502 },
    );
  }
}
