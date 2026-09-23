import { db } from './db';

const authUserId = process.argv[2];

if (!authUserId) {
  throw new Error('Usage: bun run admin:grant -- <neon-auth-user-id>');
}

await db.query(
  `INSERT INTO inventory_admins (auth_user_id) VALUES ($1)
   ON CONFLICT (auth_user_id) DO UPDATE SET revoked_at = NULL`,
  [authUserId],
);

await db.end();
console.log(`Inventory admin access granted to ${authUserId}`);
