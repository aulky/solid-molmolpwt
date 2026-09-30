import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { adminUsers } from "~/lib/db/schema";
import {
  getAdminFromSession,
  verifyPassword,
  hashPassword,
  invalidateUserSessions,
  SESSION_COOKIE_NAME,
} from "~/lib/auth";

export async function POST(event: APIEvent) {
  try {
    const cookie = event.request.headers.get("cookie") || "";
    const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : null;

    const admin = await getAdminFromSession(token);
    if (!admin) {
      return new Response(JSON.stringify({ error: "Sesi tidak sah atau telah berakhir" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await event.request.json();
    const { oldPassword, newPassword, confirmPassword } = body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return new Response(JSON.stringify({ error: "Semua kolom password wajib diisi" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password baru harus memiliki minimal 6 karakter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (newPassword !== confirmPassword) {
      return new Response(
        JSON.stringify({ error: "Konfirmasi password baru tidak cocok" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ambil user dari database
    const users = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, admin.userId))
      .limit(1);

    if (users.length === 0) {
      return new Response(JSON.stringify({ error: "User admin tidak ditemukan" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const user = users[0];
    const passwordValid = await verifyPassword(oldPassword, user.passwordHash);
    if (!passwordValid) {
      return new Response(JSON.stringify({ error: "Password lama tidak sesuai" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Hash dan simpan password baru
    const newHash = await hashPassword(newPassword);
    await db
      .update(adminUsers)
      .set({ passwordHash: newHash })
      .where(eq(adminUsers.id, admin.userId));

    // Bersihkan sesi aktif lama dari memory cache agar login berikutnya fresh
    invalidateUserSessions(admin.userId);

    return new Response(
      JSON.stringify({ success: true, message: "Password admin berhasil diperbarui" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Change password error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Gagal mengubah password" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
