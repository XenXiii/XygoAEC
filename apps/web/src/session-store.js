import crypto from "node:crypto";

function key(secret) {
  return crypto.createHash("sha256").update(secret).digest();
}

function sessionKey(id, secret) {
  return crypto.createHmac("sha256", secret).update(id).digest("hex");
}

function encrypt(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(secret), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return { payload, iv, tag: cipher.getAuthTag() };
}

function decrypt(row, secret) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(secret), row.encryption_iv);
  decipher.setAuthTag(row.encryption_tag);
  return JSON.parse(Buffer.concat([decipher.update(row.encrypted_payload), decipher.final()]).toString("utf8"));
}

export function createMemorySessionStore({ now = () => Date.now() } = {}) {
  const rows = new Map();
  return {
    async set(id, record) { rows.set(id, structuredClone(record)); },
    async get(id) {
      const record = rows.get(id);
      if (!record || record.idleExpiresAt <= now() || record.absoluteExpiresAt <= now()) {
        if (record) rows.delete(id);
        return null;
      }
      return structuredClone(record);
    },
    async delete(id) { rows.delete(id); },
    async cleanup() {
      let deleted = 0;
      for (const [id, record] of rows) {
        if (record.idleExpiresAt <= now() || record.absoluteExpiresAt <= now()) {
          rows.delete(id);
          deleted += 1;
        }
      }
      return deleted;
    }
  };
}

export function createPostgresSessionStore({ connectionString, encryptionSecret, lookupSecret, poolOptions = {}, pool: injectedPool } = {}) {
  if (!connectionString && !injectedPool) throw new Error("PostgreSQL session store requires a connection string.");
  if (!encryptionSecret || encryptionSecret.length < 32) throw new Error("Session encryption secret must contain at least 32 characters.");
  if (!lookupSecret || lookupSecret.length < 32) throw new Error("Session lookup secret must contain at least 32 characters.");
  let poolPromise;
  async function getPool() {
    if (injectedPool) return injectedPool;
    poolPromise ??= import("pg").then(({ default: pg }) => new pg.Pool({ connectionString, ...poolOptions, application_name: "xygo-web" }));
    return poolPromise;
  }
  return {
    async set(id, record) {
      const encrypted = encrypt(record, encryptionSecret);
      const pool = await getPool();
      await pool.query(
        `INSERT INTO web_auth_sessions
          (session_key, kind, encrypted_payload, encryption_iv, encryption_tag, idle_expires_at, absolute_expires_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         ON CONFLICT (session_key) DO UPDATE SET encrypted_payload=$3, encryption_iv=$4,
           encryption_tag=$5, idle_expires_at=$6, absolute_expires_at=$7, updated_at=$8`,
        [sessionKey(id, lookupSecret), record.kind, encrypted.payload, encrypted.iv, encrypted.tag,
          new Date(record.idleExpiresAt), new Date(record.absoluteExpiresAt), new Date()]
      );
    },
    async get(id) {
      const pool = await getPool();
      const result = await pool.query(
        `DELETE FROM web_auth_sessions WHERE session_key=$1
           AND (idle_expires_at <= now() OR absolute_expires_at <= now())`, [sessionKey(id, lookupSecret)]
      );
      if (result.rowCount) return null;
      const found = await pool.query(
        `SELECT encrypted_payload, encryption_iv, encryption_tag FROM web_auth_sessions
         WHERE session_key=$1 AND idle_expires_at > now() AND absolute_expires_at > now()`,
        [sessionKey(id, lookupSecret)]
      );
      return found.rows[0] ? decrypt(found.rows[0], encryptionSecret) : null;
    },
    async delete(id) {
      const pool = await getPool();
      await pool.query("DELETE FROM web_auth_sessions WHERE session_key=$1", [sessionKey(id, lookupSecret)]);
    },
    async cleanup() {
      const pool = await getPool();
      const result = await pool.query("DELETE FROM web_auth_sessions WHERE idle_expires_at <= now() OR absolute_expires_at <= now()");
      return result.rowCount;
    }
  };
}

export function createConfiguredSessionStore(config, options = {}) {
  if (options.sessionStore) return options.sessionStore;
  if (config.session.storeBackend === "postgres") {
    return createPostgresSessionStore({
      connectionString: config.session.postgresUrl,
      encryptionSecret: config.session.encryptionSecret,
      lookupSecret: config.session.secret,
      poolOptions: options.poolOptions
    });
  }
  return createMemorySessionStore(options);
}
