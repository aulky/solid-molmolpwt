import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, and, gt } from "drizzle-orm";
import { db } from "./db";
import { adminSessions, adminUsers } from "./db/schema";

export const SESSION_COOKIE_NAME = "molmol_admin_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 hari

export interface AdminSessionUser {
  sessionId: string;
  userId: number;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
}

interface CachedSession {
  admin: AdminSessionUser;
  expiresAt: number;
}

// In-memory cache untuk verifikasi sesi super cepat (sub-millisecond)
const sessionCache = new Map<string, CachedSession>();

export function setCachedSession(
  tokenHash: string,
  admin: AdminSessionUser,
  expiresAt: Date
) {
  sessionCache.set(tokenHash, {
    admin,
    expiresAt: expiresAt.getTime(),
  });
}

export function invalidateCachedSession(tokenHash: string) {
  sessionCache.delete(tokenHash);
}

export function invalidateUserSessions(userId: number) {
  for (const [key, value] of sessionCache.entries()) {
    if (value.admin.userId === userId) {
      sessionCache.delete(key);
    }
  }
}

/**
 * Hash token sesi menggunakan SHA-256 untuk disimpan di database
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Verifikasi kecocokan password dengan hash bcrypt
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hash password baru dengan bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Membuat sesi admin baru di database dan mendaftarkannya ke in-memory cache
 */
export async function createAdminSession(
  adminUserId: number,
  ip?: string,
  userAgent?: string,
  userData?: { username: string; displayName: string; role: string }
): Promise<{ token: string; expiresAt: Date; sessionId: string; tokenHash: string }> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await db.insert(adminSessions).values({
    id: sessionId,
    tokenHash,
    adminUserId,
    expiresAt,
    ip: ip || null,
    userAgent: userAgent || null,
    createdAt: new Date(),
  });

  if (userData) {
    setCachedSession(
      tokenHash,
      {
        sessionId,
        userId: adminUserId,
        username: userData.username,
        displayName: userData.displayName,
        role: userData.role,
        isActive: true,
      },
      expiresAt
    );
  }

  return { token: rawToken, expiresAt, sessionId, tokenHash };
}

/**
 * Memvalidasi token sesi dan mengembalikan data admin jika valid (memeriksa memory cache terlebih dahulu)
 */
export async function getAdminFromSession(token: string | undefined | null): Promise<AdminSessionUser | null> {
  if (!token) return null;

  try {
    const tokenHash = hashToken(token);
    const now = Date.now();

    // 1. Cek fast in-memory cache
    const cached = sessionCache.get(tokenHash);
    if (cached) {
      if (cached.expiresAt > now && cached.admin.isActive) {
        return cached.admin;
      }
      sessionCache.delete(tokenHash);
    }

    // 2. Query database jika tidak ada di memory cache
    const nowDate = new Date(now);
    const result = await db
      .select({
        sessionId: adminSessions.id,
        userId: adminUsers.id,
        username: adminUsers.username,
        displayName: adminUsers.displayName,
        role: adminUsers.role,
        isActive: adminUsers.isActive,
      })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
      .where(and(eq(adminSessions.tokenHash, tokenHash), gt(adminSessions.expiresAt, nowDate)))
      .limit(1);

    if (result.length === 0 || !result[0].isActive) {
      sessionCache.delete(tokenHash);
      return null;
    }

    const admin = result[0];
    sessionCache.set(tokenHash, {
      admin,
      expiresAt: Math.min(now + 30 * 60 * 1000, now + SESSION_MAX_AGE_SECONDS * 1000),
    });

    return admin;
  } catch (err) {
    console.error("Gagal memeriksa sesi admin:", err);
    return null;
  }
}

/**
 * Menghapus sesi admin saat logout (database & memory cache)
 */
export async function destroyAdminSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  try {
    const tokenHash = hashToken(token);
    invalidateCachedSession(tokenHash);
    await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash));
  } catch (err) {
    console.error("Gagal menghapus sesi admin:", err);
  }
}
