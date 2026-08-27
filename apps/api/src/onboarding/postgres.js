// PostgreSQL adapter for the onboarding + audit-intent journey. The objective
// and business details are sensitive, so the whole journey is encrypted by the
// application; queryable lifecycle columns are stored alongside the ciphertext.
export function createPostgresOnboardingRepository({ pool, encryptJson, decryptJson }) {
  if (!pool?.query || !encryptJson || !decryptJson) throw new Error("Postgres onboarding repository requires pool and encryption codec.");
  return {
    async save(journey) {
      await pool.query(
        "INSERT INTO onboarding_journeys(id,workspace_id,owner_user_id,state,applied_events,payload_ciphertext,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET workspace_id=EXCLUDED.workspace_id,owner_user_id=EXCLUDED.owner_user_id,state=EXCLUDED.state,applied_events=EXCLUDED.applied_events,payload_ciphertext=EXCLUDED.payload_ciphertext,updated_at=EXCLUDED.updated_at",
        [journey.id, journey.workspaceId, journey.ownerUserId, journey.state, journey.appliedEvents, encryptJson(journey), journey.createdAt, journey.updatedAt]
      );
      return journey;
    },
    async get(journeyId) {
      const { rows } = await pool.query("SELECT payload_ciphertext FROM onboarding_journeys WHERE id=$1", [journeyId]);
      return rows[0] ? decryptJson(rows[0].payload_ciphertext) : null;
    }
  };
}
