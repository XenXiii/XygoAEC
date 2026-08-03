import fs from "node:fs";

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
  }
];

export async function applyPostgresMigrations(queryable) {
  const client = typeof queryable.connect === "function" ? await queryable.connect() : queryable;
  try {
    for (const migration of POSTGRES_MIGRATIONS) {
      const sql = fs.readFileSync(migration.url, "utf8");
      await client.query("BEGIN");
      try {
        // Deliberately execute the idempotent DDL on every run. CI invokes this
        // command twice so a migration that only works on a clean database fails.
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
          [migration.version]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Postgres migration ${migration.version} failed: ${error.message}`, { cause: error });
      }
    }
  } finally {
    if (client !== queryable) client.release();
  }

  return POSTGRES_MIGRATIONS.map((migration) => migration.version);
}
