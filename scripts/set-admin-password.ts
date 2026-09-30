import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, testDbConnection } from "../src/lib/db";
import { adminUsers } from "../src/lib/db/schema";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const newPasswordArg = process.argv[2];
  const targetPassword = newPasswordArg || process.env.DEFAULT_ADMIN_PASSWORD || "AdminMolMolPurwokerto2026!";
  const username = process.env.DEFAULT_ADMIN_USERNAME || "admin";

  console.log(`[INFO] Menyetel password untuk admin user "${username}"...`);

  const connStatus = await testDbConnection();
  if (!connStatus.ok) {
    console.error("[ERROR] Gagal terhubung ke database:", connStatus.error);
    process.exit(1);
  }

  const existing = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.username, username))
    .limit(1);

  const hash = await bcrypt.hash(targetPassword, 10);

  if (existing.length === 0) {
    await db.insert(adminUsers).values({
      username,
      passwordHash: hash,
      displayName: process.env.DEFAULT_ADMIN_NAME || "Owner Mol-Mol",
      role: "owner",
      isActive: true,
      createdAt: new Date(),
    });
    console.log(`[OK] User "${username}" baru dibuat dengan password: ${targetPassword}`);
  } else {
    await db
      .update(adminUsers)
      .set({ passwordHash: hash, isActive: true })
      .where(eq(adminUsers.id, existing[0].id));
    console.log(`[OK] Password untuk user "${username}" berhasil diubah menjadi: ${targetPassword}`);
  }

  // Verifikasi langsung
  const testMatch = await bcrypt.compare(targetPassword, hash);
  console.log(`[VERIFIKASI] Kecocokan password baru: ${testMatch ? "BERHASIL" : "GAGAL"}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[ERROR]:", err);
  process.exit(1);
});
