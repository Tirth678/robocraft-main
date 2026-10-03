import { setDefaultResultOrder } from 'node:dns';
import pg from 'pg';

const { Pool } = pg;

// Node 18+ resolves in DNS "verbatim" order, so a dual-homed host can be
// reached over IPv6 first. Some networks have a broken IPv6 path that fails with
// "SSL SYSCALL error: EOF", so prefer IPv4 for the database host.
setDefaultResultOrder('ipv4first');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — admin-service refuses to start');
}

export const pool = new Pool({
  connectionString,
  max: Number(process.env.ADMIN_PG_POOL_MAX ?? 5),
  // Neon closes idle pooled connections, and `pg` then tries to authenticate on
  // a socket that is already gone ("Authentication timed out"). Keeping
  // connections warm and recycling them before the pooler does avoids that.
  keepAlive: true,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  ssl: connectionString.includes('sslmode') ? undefined : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[ADMIN-DB] idle client error:', err.message);
});

export type Row = Record<string, any>;

const CONNECTION_LEVEL = /authentication timed out|connection terminated|server closed the connection|ECONNRESET|ETIMEDOUT|EPIPE|Client has encountered a connection error/i;

/**
 * Runs a query, retrying once when the pooler hands back a dead connection.
 *
 * These are connection-lifecycle faults rather than query faults, so the
 * statement is safe to replay: nothing has been sent to a live backend.
 */
export async function query<T extends Row = Row>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number | null }> {
  try {
    return (await pool.query(text, params as any[])) as { rows: T[]; rowCount: number | null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!CONNECTION_LEVEL.test(message)) throw err;
    console.warn('[ADMIN-DB] retrying after connection fault:', message.slice(0, 80));
    return (await pool.query(text, params as any[])) as { rows: T[]; rowCount: number | null };
  }
}

/**
 * Runs `fn` inside a transaction, rolling back on any throw.
 *
 * Stock mutations take a row lock (`FOR UPDATE`) before reading the current
 * quantity, so two concurrent admins cannot interleave a read-modify-write and
 * drive stock negative or lose a movement.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
}