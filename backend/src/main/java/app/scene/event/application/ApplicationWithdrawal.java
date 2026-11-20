package app.scene.event.application;

import java.time.Instant;

/**
 * Who withdrew an application, when, and why (DEC-084 §2). {@code reason} is operator text, null
 * when none was given; it is shown to operators only and never goes to audit, logs or the CSV.
 * {@code reapplyBlocked} is true when the withdraw also made the six-digit number unusable.
 */
public record ApplicationWithdrawal(
    Instant withdrawnAt, String withdrawnByDisplayName, String reason, boolean reapplyBlocked) {}
