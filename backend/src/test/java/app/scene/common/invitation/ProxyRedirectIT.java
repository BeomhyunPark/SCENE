package app.scene.common.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.support.PostgresTestcontainer;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;

/**
 * #389 moved forwarded headers to the native strategy. Google sign-in (#232) still builds its
 * redirect address from nginx's X-Forwarded-Proto and Host, and a client X-Forwarded-Port is not
 * part of it because nginx clears it.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresTestcontainer.class)
class ProxyRedirectIT {

  @Autowired Environment environment;

  @Test
  void googleRedirectAddressUsesTheProxyScheme() throws Exception {
    int port = environment.getRequiredProperty("local.server.port", Integer.class);
    HttpResponse<Void> response =
        HttpClient.newBuilder()
            .proxy(HttpClient.Builder.NO_PROXY)
            .build()
            .send(
                HttpRequest.newBuilder(
                        URI.create("http://127.0.0.1:" + port + "/oauth2/authorization/google"))
                    .header("X-Forwarded-Proto", "https")
                    .header("X-Forwarded-Host", "scene.example")
                    .header("X-Forwarded-For", "203.0.113.30")
                    .build(),
                HttpResponse.BodyHandlers.discarding());
    assertThat(response.statusCode()).isEqualTo(302);
    assertThat(response.headers().firstValue("Location").orElseThrow())
        .contains("redirect_uri=https://scene.example/login/oauth2/code/google");
  }
}
