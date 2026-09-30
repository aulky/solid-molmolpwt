import type { APIEvent } from "@solidjs/start/server";
import { destroyAdminSession, SESSION_COOKIE_NAME } from "~/lib/auth";

export async function POST(event: APIEvent) {
  const cookie = event.request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
  const token = match ? decodeURIComponent(match[1]) : null;

  if (token) {
    await destroyAdminSession(token);
  }

  const clearCookieHeader = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearCookieHeader,
    },
  });
}
