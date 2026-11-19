package app.scene.common.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Real HTTP calls to a running Tomcat, so {@code server.forward-headers-strategy} applies. MockMvc
 * skips Tomcat valves and cannot show which client address the rate limit sees (#389).
 */
final class InvitationClientAddressSupport {

  static final String ACCEPT = "/api/v1/operator/space-invitations/accept";

  private static final String CSRF = "csrf-token";

  private final HttpClient http =
      HttpClient.newBuilder().proxy(HttpClient.Builder.NO_PROXY).build();

  private final int port;

  private final JdbcTemplate jdbc;

  InvitationClientAddressSupport(int port, JdbcTemplate jdbc) {
    this.port = port;
    this.jdbc = jdbc;
  }

  /** A new account with its own session, so only the address bucket can be shared. */
  String session(String name) throws Exception {
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO users (id, display_name) VALUES (?, ?)", id, name);
    HttpResponse<String> response =
        send(
            request("/api/v1/operator/auth/login", null)
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        "{\"userId\":\"" + id + "\",\"email\":\"" + name + "@example.com\"}"))
                .build());
    assertThat(response.statusCode()).isEqualTo(200);
    String cookie =
        response.headers().allValues("Set-Cookie").stream()
            .filter(value -> value.startsWith("SCENE_SESSION="))
            .findFirst()
            .orElseThrow();
    return cookie.substring(0, cookie.indexOf(';'));
  }

  /**
   * Accepts an unknown token. Each call takes one attempt from the account and address buckets
   * before the lookup, so it answers 404 until a bucket is spent and 429 after.
   */
  int accept(String session, String... headers) throws Exception {
    HttpRequest.Builder builder =
        request(ACCEPT, session).POST(HttpRequest.BodyPublishers.ofString("{\"token\":\"nope\"}"));
    for (int i = 0; i < headers.length; i += 2) {
      builder.header(headers[i], headers[i + 1]);
    }
    HttpResponse<String> response = send(builder.build());
    if (response.statusCode() == 429) {
      assertThat(response.body()).contains("\"RATE_LIMITED\"");
    } else {
      assertThat(response.body()).contains("\"INVITATION_NOT_FOUND\"");
    }
    return response.statusCode();
  }

  private HttpRequest.Builder request(String path, String session) {
    String cookies = "XSRF-TOKEN=" + CSRF + (session == null ? "" : "; " + session);
    return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
        .header("Content-Type", "application/json")
        .header("X-XSRF-TOKEN", CSRF)
        .header("Cookie", cookies);
  }

  private HttpResponse<String> send(HttpRequest request) throws Exception {
    return http.send(request, HttpResponse.BodyHandlers.ofString());
  }
}
