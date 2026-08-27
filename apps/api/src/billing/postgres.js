export function createPostgresBillingRepository({ pool }) {
  if (!pool?.query) throw new Error("Postgres billing repository requires a pool.");
  return {
    async getSubscription(workspaceId) {
      const { rows } = await pool.query(`SELECT workspace_id AS "workspaceId", provider_customer_id AS "providerCustomerId", provider_subscription_id AS "providerSubscriptionId", plan_code AS "planCode", status, latest_provider_event_id AS "latestProviderEventId", updated_at AS "updatedAt" FROM client_subscriptions WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 1`, [workspaceId]);
      return rows[0] ?? null;
    },
    async saveSubscription(record) {
      if (!record.providerCustomerId || !record.planCode) throw Object.assign(new Error("Stripe subscription metadata is incomplete."), { status: 400 });
      const { rows } = await pool.query(`INSERT INTO client_subscriptions(id,workspace_id,provider_customer_id,provider_subscription_id,plan_code,status,entitlement_updated_at,latest_provider_event_id,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$7) ON CONFLICT(id) DO UPDATE SET provider_customer_id=EXCLUDED.provider_customer_id,provider_subscription_id=EXCLUDED.provider_subscription_id,plan_code=EXCLUDED.plan_code,status=EXCLUDED.status,entitlement_updated_at=EXCLUDED.entitlement_updated_at,latest_provider_event_id=EXCLUDED.latest_provider_event_id,updated_at=EXCLUDED.updated_at RETURNING workspace_id AS "workspaceId",provider_customer_id AS "providerCustomerId",provider_subscription_id AS "providerSubscriptionId",plan_code AS "planCode",status,latest_provider_event_id AS "latestProviderEventId",updated_at AS "updatedAt"`, [`stripe:${record.workspaceId}`, record.workspaceId, record.providerCustomerId, record.providerSubscriptionId, record.planCode, record.status, record.updatedAt, record.latestProviderEventId]);
      return rows[0];
    },
    async hasEvent(providerEventId) {
      const { rows } = await pool.query("SELECT 1 FROM subscription_events WHERE provider_event_id=$1", [providerEventId]);
      return rows.length > 0;
    },
    async saveEvent(record) {
      await pool.query("INSERT INTO subscription_events(provider_event_id,workspace_id,event_type,payload,processed_at,livemode,outcome) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(provider_event_id) DO NOTHING", [record.providerEventId, record.workspaceId, record.eventType, {}, record.processedAt, record.livemode ?? false, record.outcome ?? "processed"]);
      return record;
    },
    async listEvents(workspaceId) {
      const { rows } = await pool.query(`SELECT provider_event_id AS "providerEventId",workspace_id AS "workspaceId",event_type AS "eventType",processed_at AS "processedAt",livemode,outcome FROM subscription_events WHERE workspace_id=$1 ORDER BY processed_at`, [workspaceId]);
      return rows;
    }
  };
}
