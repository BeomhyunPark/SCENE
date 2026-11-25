package app.scene.common.invitation;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Invitation mail settings. The SMTP server itself is {@code spring.mail.*}.
 *
 * @param enabled true sends real mail through {@code spring.mail.*}; false returns the link once
 * @param from sender address, e.g. {@code SCENE <no-reply@example.org>}
 * @param linkBaseUrl public origin the recipient opens, e.g. {@code https://scene.example.org}
 */
@ConfigurationProperties("scene.mail")
public record InvitationMailProperties(boolean enabled, String from, String linkBaseUrl) {}
