package app.scene.event.lifecycle;

/**
 * Command body. {@code expectedLifecycleVersion} is null when the field was omitted. {@code
 * invalidField} is a present field whose type is not the contract type. Both are judged after
 * authorization so a forbidden caller stays 403.
 */
public record LifecycleRequest(
    Integer expectedLifecycleVersion,
    Boolean acknowledgeWarnings,
    String reason,
    String overrideReason,
    String invalidField) {

  public LifecycleRequest(
      int expectedLifecycleVersion,
      Boolean acknowledgeWarnings,
      String reason,
      String overrideReason) {
    this(expectedLifecycleVersion, acknowledgeWarnings, reason, overrideReason, null);
  }
}
