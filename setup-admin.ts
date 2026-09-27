import postgres from 'postgres';
import { hashPassword } from '@better-auth/utils/password';

const sql = postgres(process.env.DATABASE_URL!);

async function setupAdminUsers() {
  console.log('Setting up admin users...');

  try {
    const adminEmails = ['admin@robocraft.com', 'tirth@robocraft.com'];
    const defaultPassword = 'Admin123!';
    const passwordHash = await hashPassword(defaultPassword);

    // 1. Check existing users in neon_auth.user
    const existingUsers = await sql`
      SELECT id, email, name FROM neon_auth.user 
      WHERE email IN ${sql(adminEmails)}
    `;
    
    console.log('Found existing admin users in neon_auth.user:', existingUsers);

    // 2. Set roles in neon_auth.user
    for (const user of existingUsers) {
      await sql`
        UPDATE neon_auth.user 
        SET role = 'admin'
        WHERE id = ${user.id}
      `;
      console.log(`Set admin role for ${user.email}`);

      // 3. Set or update password in neon_auth.account
      const updatedAccount = await sql`
        UPDATE neon_auth.account
        SET password = ${passwordHash}, "updatedAt" = NOW()
        WHERE "userId" = ${user.id} AND "providerId" = 'credential'
        RETURNING id
      `;

      if (updatedAccount.length > 0) {
        console.log(`Updated password for ${user.email} in neon_auth.account (default: ${defaultPassword})`);
      } else {
        // Create credential account if one didn't exist
        const accountId = user.id;
        await sql`
          INSERT INTO neon_auth.account (
            id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), ${accountId}, 'credential', ${user.id}, ${passwordHash}, NOW(), NOW()
          )
          ON CONFLICT ("providerId", "accountId") DO UPDATE SET password = ${passwordHash}
        `;
        console.log(`Created credential account for ${user.email} with password: ${defaultPassword}`);
      }
    }

    // 4. Ensure entries in inventory_admins table
    for (const user of existingUsers) {
      await sql`
        INSERT INTO inventory_admins (id, auth_user_id, email, role, is_active, created_at, updated_at, revoked_at)
        VALUES (gen_random_uuid()::text, ${user.id}, ${user.email}, 'admin', true, NOW(), NOW(), NULL)
        ON CONFLICT (auth_user_id) DO UPDATE 
        SET email = EXCLUDED.email, role = 'admin', is_active = true, revoked_at = NULL, updated_at = NOW()
      `;
      console.log(`Synchronized ${user.email} in inventory_admins`);
    }

    // 5. Verify the setup
    const adminCheck = await sql`
      SELECT u.email, u.role, ia.auth_user_id, ia.is_active, ia.revoked_at
      FROM neon_auth.user u
      LEFT JOIN inventory_admins ia ON u.id::text = ia.auth_user_id
      WHERE u.email IN ${sql(adminEmails)}
    `;
    
    console.log('Final admin configuration:', adminCheck);
    console.log(`\n=============================================`);
    console.log(`Admin accounts ready!`);
    console.log(`Email: admin@robocraft.com`);
    console.log(`Password: ${defaultPassword}`);
    console.log(`Email: tirth@robocraft.com`);
    console.log(`Password: ${defaultPassword}`);
    console.log(`=============================================\n`);
    
    await sql.end();
  } catch (error) {
    console.error('Error setting up admin users:', error);
    process.exit(1);
  }
}

setupAdminUsers();