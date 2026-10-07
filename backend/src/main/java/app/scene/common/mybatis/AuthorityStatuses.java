package app.scene.common.mybatis;

import java.util.List;

/** Statuses that count as an ended owner handover in {@code ownerAuthorityEnded}. */
public final class AuthorityStatuses {

  public static final List<String> ENDED = List.of("HANDOVER", "COMPLETED");

  private AuthorityStatuses() {}
}
