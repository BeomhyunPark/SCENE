package app.scene.identity;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Bootstrap owner (DEC-069). When {@code ownerEmail} signs in with Google and the database has no
 * space yet, SCENE creates {@code spaceName} with that user as OWNER. Both blank means no
 * bootstrap.
 */
@ConfigurationProperties("scene.bootstrap")
public record GoogleSignInProperties(String ownerEmail, String spaceName) {}
