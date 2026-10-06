package app.scene.common.sql;

/**
 * Shared SQL for "this OWNER row no longer has owner authority". The outer row alias is {@code o}.
 */
public final class EffectiveOwnerSql {

  /**
   * True when {@code o.user_id} handed the event away, the handover ended, and they did not take it
   * back later.
   */
  public static final String OWNER_AUTHORITY_ENDED =
      """
      EXISTS (
        SELECT 1 FROM owner_transfers t
        WHERE t.space_id = o.space_id AND t.event_id = o.event_id
          AND t.from_user_id = o.user_id
          AND t.status IN ('HANDOVER', 'COMPLETED')
          AND t.handover_ends_at <= now()
          AND NOT EXISTS (
            SELECT 1 FROM owner_transfers r
            WHERE r.space_id = t.space_id AND r.event_id = t.event_id
              AND r.to_user_id = t.from_user_id
              AND r.status IN ('HANDOVER', 'COMPLETED')
              AND r.accepted_at > t.accepted_at))
      """;

  private EffectiveOwnerSql() {}
}
