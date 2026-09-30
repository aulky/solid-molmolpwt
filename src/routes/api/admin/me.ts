import type { APIEvent } from "@solidjs/start/server";
import { getAdminFromSession, SESSION_COOKIE_NAME } from "~/lib/auth";

export async function GET(event: APIEvent) {
  try {
    const cookie = event.request.headers.get("cookie") || "";
    const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : null;

    if (!token) {
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    const admin = await getAdminFromSession(token);
    if (!admin) {
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    return new Response(
      JSON.stringify({
        authenticated: true,
        user: {
          id: admin.userId,
          username: admin.username,
          displayName: admin.displayName,
          role: admin.role,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ authenticated: false, error: err?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
