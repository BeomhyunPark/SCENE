package app.scene.identity;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

/**
 * Google sign-in routes ({@code /oauth2/authorization/google}, {@code /login/oauth2/code/google}).
 * They share the operator session store, so a successful sign-in is an ordinary {@code
 * SCENE_SESSION}. Google's tokens are not kept: SCENE needs only the verified identity (DEC-069).
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(GoogleSignInProperties.class)
class GoogleLoginSecurity {

  @Bean
  @Order(0)
  SecurityFilterChain googleLoginChain(HttpSecurity http, GoogleSignInHandler handler)
      throws Exception {
    http.securityMatcher("/oauth2/**", "/login/oauth2/**");
    http.securityContext(
        context -> context.securityContextRepository(new HttpSessionSecurityContextRepository()));
    http.sessionManagement(
        session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED));
    http.authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll());
    http.oauth2Login(
        login ->
            login
                .authorizedClientRepository(new NoAuthorizedClients())
                .successHandler(handler)
                .failureHandler(handler));
    return http.build();
  }

  /** Drops Google access and refresh tokens instead of storing them in the session. */
  private static final class NoAuthorizedClients implements OAuth2AuthorizedClientRepository {

    @Override
    public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(
        String clientRegistrationId,
        org.springframework.security.core.Authentication principal,
        jakarta.servlet.http.HttpServletRequest request) {
      return null;
    }

    @Override
    public void saveAuthorizedClient(
        OAuth2AuthorizedClient authorizedClient,
        org.springframework.security.core.Authentication principal,
        jakarta.servlet.http.HttpServletRequest request,
        jakarta.servlet.http.HttpServletResponse response) {}

    @Override
    public void removeAuthorizedClient(
        String clientRegistrationId,
        org.springframework.security.core.Authentication principal,
        jakarta.servlet.http.HttpServletRequest request,
        jakarta.servlet.http.HttpServletResponse response) {}
  }
}
