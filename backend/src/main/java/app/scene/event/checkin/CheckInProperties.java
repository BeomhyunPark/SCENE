package app.scene.event.checkin;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Check-in settings (DEC-071). {@code codeSecret} signs the participant QR value. Blank means no QR
 * value verifies, so QR check-in answers 404 until the environment sets it. Changing it voids every
 * QR already shown, so it does not change during an event.
 */
@ConfigurationProperties("scene.checkin")
public record CheckInProperties(String codeSecret) {}
