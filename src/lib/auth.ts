import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, and, gt } from "drizzle-orm";
import { db } from "./db";
import { adminSessions, adminUsers } from "./db/schema";

export const SESSION_COOKIE_NAME = "molmol_admin_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 hari

const JWT_SECRET =
  process.env.SESSION_SECRET ||
  process.env.JWT_SECRET ||
  "molmol_admin_jwt_secret_purwokerto_2026_super_key_!@#$";

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
  key: string,
  admin: AdminSessionUser,
  expiresAt: Date
) {
  sessionCache.set(key, {
    admin,
    expiresAt: expiresAt.getTime(),
  });
}

export function invalidateCachedSession(key: string) {
  sessionCache.delete(key);
}

export function invalidateUserSessions(userId: number) {
  for (const [key, value] of sessionCache.entries()) {
    if (value.admin.userId === userId) {
      sessionCache.delete(key);
    }
  }
}

/**
 * Base64URL encode & decode helpers
 */
function base64UrlEncode(str: string | Buffer): string {
  const buf = typeof str === "string" ? Buffer.from(str, "utf8") : str;
  return buf.toString("base64url");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

/**
 * Sign JWT token HS256
 */
export function signAdminJwt(payload: Record<string, any>, secret: string = JWT_SECRET): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", secret).update(message).digest("base64url");
  return `${message}.${signature}`;
}

/**
 * Verify JWT token HS256
 */
export function verifyAdminJwt<T = any>(token: string, secret: string = JWT_SECRET): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    const message = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto.createHmac("sha256", secret).update(message).digest("base64url");

    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(signatureB64);
    if (expectedBuf.length !== actualBuf.length) return null;
    if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64)) as any;
    if (payload.exp && typeof payload.exp === "number") {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec >= payload.exp) return null;
    }
    return payload as T;
  } catch {
    return null;
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
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const nowSec = Math.floor(Date.now() / 1000);

  const payload = {
    sessionId,
    userId: adminUserId,
    username: userData?.username || "",
    displayName: userData?.displayName || "",
    role: userData?.role || "admin",
    iat: nowSec,
    exp: nowSec + SESSION_MAX_AGE_SECONDS,
  };

  const token = signAdminJwt(payload, JWT_SECRET);
  const tokenHash = hashToken(token);

  await db.insert(adminSessions).values({
    id: sessionId,
    tokenHash,
    adminUserId,
    expiresAt,
    ip: ip || null,
    userAgent: userAgent || null,
    createdAt: new Date(),
  });

  const sessionUser: AdminSessionUser = {
    sessionId,
    userId: adminUserId,
    username: userData?.username || "",
    displayName: userData?.displayName || "",
    role: userData?.role || "admin",
    isActive: true,
  };

  setCachedSession(sessionId, sessionUser, expiresAt);
  setCachedSession(tokenHash, sessionUser, expiresAt);

  return { token, expiresAt, sessionId, tokenHash };
}

/**
 * Memvalidasi token sesi dan mengembalikan data admin jika valid (memeriksa memory cache terlebih dahulu)
 */
export async function getAdminFromSession(token: string | undefined | null): Promise<AdminSessionUser | null> {
  if (!token) return null;

  try {
    const now = Date.now();

    // 1. Coba decode & verifikasi JWT
    const jwtPayload = verifyAdminJwt<{
      sessionId: string;
      userId: number;
      username: string;
      displayName: string;
      role: string;
    }>(token, JWT_SECRET);

    if (jwtPayload && jwtPayload.sessionId) {
      // 1a. Cek in-memory session cache (0 ms)
      const cached = sessionCache.get(jwtPayload.sessionId);
      if (cached) {
        if (cached.expiresAt > now && cached.admin.isActive) {
          return cached.admin;
        }
        sessionCache.delete(jwtPayload.sessionId);
      }

      // 1b. Cek database jika tidak di memory cache
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
        .where(
          and(
            eq(adminSessions.id, jwtPayload.sessionId),
            gt(adminSessions.expiresAt, nowDate)
          )
        )
        .limit(1);

      if (result.length === 0 || !result[0].isActive) {
        sessionCache.delete(jwtPayload.sessionId);
        return null;
      }

      const admin = result[0];
      setCachedSession(
        jwtPayload.sessionId,
        admin,
        new Date(Math.min(now + 60 * 60 * 1000, now + SESSION_MAX_AGE_SECONDS * 1000))
      );
      return admin;
    }

    // 2. Fallback untuk token legacy / format hex non-JWT
    const tokenHash = hashToken(token);
    const cachedLegacy = sessionCache.get(tokenHash);
    if (cachedLegacy) {
      if (cachedLegacy.expiresAt > now && cachedLegacy.admin.isActive) {
        return cachedLegacy.admin;
      }
      sessionCache.delete(tokenHash);
    }

    // 3. Query database jika tidak ada di memory cache
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
    const jwtPayload = verifyAdminJwt<{ sessionId: string }>(token, JWT_SECRET);
    if (jwtPayload?.sessionId) {
      invalidateCachedSession(jwtPayload.sessionId);
      await db.delete(adminSessions).where(eq(adminSessions.id, jwtPayload.sessionId));
    }
    const tokenHash = hashToken(token);
    invalidateCachedSession(tokenHash);
    await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash));
  } catch (err) {
    console.error("Gagal menghapus sesi admin:", err);
  }
}
