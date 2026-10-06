package app.scene.event.transfer;

import java.time.Instant;

/** {@code ACCEPTED} or {@code ALREADY_ACCEPTED}, plus the server-calculated handover end. */
public record TransferAcceptResult(String outcome, Instant handoverEndsAt) {}
