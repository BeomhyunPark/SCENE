package app.scene.common.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.support.PostgresTestcontainer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * #389. The home server reaches the backend only through nginx, which puts Cloudflare's
 * CF-Connecting-IP into X-Forwarded-For. The test client connects from 127.0.0.1, inside the
 * default internal-proxies range, so it plays nginx. Accounts are new each time so only the address
 * bucket can be shared.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresTestcontainer.class)
class InvitationClientAddressIT {

  @Autowired Environment environment;

  @Autowired JdbcTemplate jdbc;

  private InvitationClientAddressSupport client;

  @BeforeEach
  void setUp() {
    client =
        new InvitationClientAddressSupport(
            environment.getRequiredProperty("local.server.port", Integer.class), jdbc);
  }

  @Test
  void clientsBehindTheTrustedProxyHaveTheirOwnAddressBuckets() throws Exception {
    String first = client.session("first");
    for (int i = 0; i < InvitationAttempts.LIMIT; i++) {
      assertThat(client.accept(first, "X-Forwarded-For", "203.0.113.10")).isEqualTo(404);
    }

    // Same reported address, new account: the address bucket is spent.
    assertThat(client.accept(client.session("same"), "X-Forwarded-For", "203.0.113.10"))
        .isEqualTo(429);
    // Another client through the same proxy keeps its own budget.
    String other = client.session("other");
    for (int i = 0; i < InvitationAttempts.LIMIT; i++) {
      assertThat(client.accept(other, "X-Forwarded-For", "203.0.113.20")).isEqualTo(404);
    }
  }

  @Test
  void forwardedHeaderIsNotAClientAddress() throws Exception {
    // nginx does not send RFC 7239 Forwarded. A client value must not give a fresh bucket each
    // time.
    for (int i = 0; i < InvitationAttempts.LIMIT; i++) {
      assertThat(client.accept(client.session("fwd" + i), "Forwarded", "for=198.51.100." + i))
          .isEqualTo(404);
    }
    assertThat(client.accept(client.session("fwd-last"), "Forwarded", "for=198.51.100.99"))
        .isEqualTo(429);
  }
}
