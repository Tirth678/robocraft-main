#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/6ce740c3b33a441c708ca1bc2136f78f769b9bd80686ce566415675dbd9bf324/contract';
import endContract from '../../snapshots/6ce740c3b33a441c708ca1bc2136f78f769b9bd80686ce566415675dbd9bf324/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/966ffb52be358bb64ee9a48673cfd863aa8bfe3aa18f4075504aa4d7922c014c/contract';
import startContract from '../../snapshots/966ffb52be358bb64ee9a48673cfd863aa8bfe3aa18f4075504aa4d7922c014c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({ schema: 'public', table: 'users', constraint: 'users_clerkId_key' }),
      this.dropColumn({ schema: 'public', table: 'users', column: 'clerkId' }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('authUserId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.dataTransform(endContract, 'backfill-users-authUserId', {
        check: () => ({ sql: 'SELECT COUNT(*) FROM users WHERE "authUserId" IS NULL', params: [] }),
        run: () => ({ sql: 'UPDATE users SET "authUserId" = CONCAT(\'clerk_\', "id") WHERE "authUserId" IS NULL', params: [] }),
      }),
      this.setNotNull({ schema: 'public', table: 'users', column: 'authUserId' }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_authUserId_key',
        columns: ['authUserId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
