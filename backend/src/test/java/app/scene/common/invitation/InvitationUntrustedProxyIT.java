package app.scene.common.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.support.PostgresTestcontainer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * #389. When the connecting address is not a trusted proxy, X-Forwarded-For is the client's own
 * claim and is ignored. Here no address is trusted, so the 127.0.0.1 client is untrusted.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "server.tomcat.remoteip.internal-proxies=10\\.255\\.255\\.254")
@Import(PostgresTestcontainer.class)
class InvitationUntrustedProxyIT {

  @Autowired Environment environment;

  @Autowired JdbcTemplate jdbc;

  @Test
  void spoofedForwardedForFromAnUntrustedPeerIsIgnored() throws Exception {
    InvitationClientAddressSupport client =
        new InvitationClientAddressSupport(
            environment.getRequiredProperty("local.server.port", Integer.class), jdbc);
    for (int i = 0; i < InvitationAttempts.LIMIT; i++) {
      assertThat(client.accept(client.session("spoof" + i), "X-Forwarded-For", "192.0.2." + i))
          .isEqualTo(404);
    }
    // Every claim counted against the real peer address.
    assertThat(client.accept(client.session("spoof-last"), "X-Forwarded-For", "192.0.2.99"))
        .isEqualTo(429);
  }
}
