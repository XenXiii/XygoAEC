import fs from "node:fs";

const MIGRATION_LOCK_KEY = "xygo-postgres-migrations-v1";

export const POSTGRES_MIGRATIONS = [
  {
    version: "0001_init",
    url: new URL("../../../../infrastructure/migrations/postgres/0001_init.sql", import.meta.url)
  },
  {
    version: "0002_paid_client_provisioning",
    url: new URL("../../../../infrastructure/migrations/postgres/0002_paid_client_provisioning.sql", import.meta.url)
  },
  {
    version: "0003_oidc_authorization",
    url: new URL("../../../../infrastructure/migrations/postgres/0003_oidc_authorization.sql", import.meta.url)
  },
  {
    version: "0004_tenant_file_storage",
    url: new URL("../../../../infrastructure/migrations/postgres/0004_tenant_file_storage.sql", import.meta.url)
  },
  {
    version: "0005_durable_outbox",
    url: new URL("../../../../infrastructure/migrations/postgres/0005_durable_outbox.sql", import.meta.url)
  },
  {
    version: "0006_email_monitoring",
    url: new URL("../../../../infrastructure/migrations/postgres/0006_email_monitoring.sql", import.meta.url)
  },
  {
    version: "0007_email_suppressions",
    url: new URL("../../../../infrastructure/migrations/postgres/0007_email_suppressions.sql", import.meta.url)
  },
  {
    version: "0008_web_auth_sessions",
    url: new URL("../../../../infrastructure/migrations/postgres/0008_web_auth_sessions.sql", import.meta.url)
  }
];

async function withClient(queryable, operation) {
  const client = typeof queryable.connect === "function" ? await queryable.connect() : queryable;
  try {
    return await operation(client);
  } finally {
    if (client !== queryable) client.release();
  }
}

async function readAppliedVersions(client) {
  const relation = await client.query("SELECT to_regclass('schema_migrations')::text AS relation");
  if (!relation.rows[0]?.relation) return [];
  const result = await client.query("SELECT version FROM schema_migrations ORDER BY version");
  return result.rows.map((row) => row.version);
}

function migrationStatus(applied) {
  const expected = POSTGRES_MIGRATIONS.map((migration) => migration.version);
  const appliedSet = new Set(applied);
  const expectedSet = new Set(expected);
  const pending = expected.filter((version) => !appliedSet.has(version));
  const unexpected = applied.filter((version) => !expectedSet.has(version));
  return {
    current: pending.length === 0 && unexpected.length === 0,
    expected,
    applied,
    pending,
    unexpected
  };
}

function schemaNotCurrent(status) {
  const details = [];
  if (status.pending.length > 0) details.push(`pending: ${status.pending.join(", ")}`);
  if (status.unexpected.length > 0) details.push(`unexpected: ${status.unexpected.join(", ")}`);
  const error = new Error(
    `Postgres schema is not current (${details.join("; ")}). Run npm run migrate:postgres before app boot.`
  );
  error.code = "postgres_schema_not_current";
  error.migrationStatus = status;
  return error;
}

export async function inspectPostgresMigrations(queryable) {
  return withClient(queryable, async (client) => migrationStatus(await readAppliedVersions(client)));
}

export async function assertPostgresMigrationsCurrent(queryable) {
  const status = await inspectPostgresMigrations(queryable);
  if (!status.current) throw schemaNotCurrent(status);
  return status;
}

export async function checkPostgresReadiness(queryable) {
  const startedAt = Date.now();
  return withClient(queryable, async (client) => {
    await client.query("SELECT 1 AS ready");
    const status = migrationStatus(await readAppliedVersions(client));
    if (!status.current) throw schemaNotCurrent(status);
    return {
      ready: true,
      latencyMs: Date.now() - startedAt,
      migrations: status.applied
    };
  });
}

export async function applyPostgresMigrations(queryable) {
  return withClient(queryable, async (client) => {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    let migrationError = null;
    try {
      const initialStatus = migrationStatus(await readAppliedVersions(client));
      if (initialStatus.unexpected.length > 0) throw schemaNotCurrent(initialStatus);
      const applied = new Set(initialStatus.applied);

      for (const migration of POSTGRES_MIGRATIONS) {
        if (applied.has(migration.version)) continue;
        const sql = fs.readFileSync(migration.url, "utf8");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [migration.version]);
          await client.query("COMMIT");
          applied.add(migration.version);
        } catch (error) {
          await client.query("ROLLBACK");
          throw new Error(`Postgres migration ${migration.version} failed: ${error.message}`, { cause: error });
        }
      }

      const finalStatus = migrationStatus(await readAppliedVersions(client));
      if (!finalStatus.current) throw schemaNotCurrent(finalStatus);
      return finalStatus.applied;
    } catch (error) {
      migrationError = error;
      throw error;
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]);
      } catch (unlockError) {
        if (!migrationError) throw unlockError;
      }
    }
  });
}
