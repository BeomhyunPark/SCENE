package app.scene.common.security;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.ProblemBodies;
import app.scene.common.web.RequestIds;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.NullSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Three filter chains. Operator and participant each read their own session cookie. Public does not
 * require either session. No login, no {@code UserDetails}, and no Spring Session.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
@EnableConfigurationProperties(SecurityProperties.class)
class SecurityConfiguration {

  static final String CSRF_COOKIE_NAME = "XSRF-TOKEN";
  static final String CSRF_HEADER_NAME = "X-XSRF-TOKEN";

  private static final List<String> PREFLIGHT_METHODS =
      List.of("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS");

  @Bean
  ChainSessionRegistry operatorSessions(SecurityProperties properties) {
    return new ChainSessionRegistry(
        properties.session().operatorCookieName(), properties.session().sameSite());
  }

  @Bean
  ChainSessionRegistry participantSessions(SecurityProperties properties) {
    return new ChainSessionRegistry(
        properties.session().participantCookieName(), properties.session().sameSite());
  }

  @Bean
  @Order(1)
  SecurityFilterChain operatorChain(
      HttpSecurity http,
      SecurityProperties properties,
      @Qualifier("operatorSessions") ChainSessionRegistry operatorSessions)
      throws Exception {
    return authenticated(
        http,
        "/api/v1/operator/**",
        properties,
        new ChainSecurityContextRepository(operatorSessions));
  }

  @Bean
  @Order(2)
  SecurityFilterChain participantChain(
      HttpSecurity http,
      SecurityProperties properties,
      @Qualifier("participantSessions") ChainSessionRegistry participantSessions)
      throws Exception {
    return authenticated(
        http,
        "/api/v1/participant/**",
        properties,
        new ChainSecurityContextRepository(participantSessions));
  }

  @Bean
  @Order(3)
  SecurityFilterChain publicChain(HttpSecurity http, SecurityProperties properties)
      throws Exception {
    shared(http, "/api/v1/public/**", properties);
    // Set before session management so STATELESS keeps this repository.
    http.securityContext(
        context -> context.securityContextRepository(new NullSecurityContextRepository()));
    http.sessionManagement(
        session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
    http.authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll());
    return http.build();
  }

  private static SecurityFilterChain authenticated(
      HttpSecurity http,
      String pattern,
      SecurityProperties properties,
      SecurityContextRepository repository)
      throws Exception {
    shared(http, pattern, properties);
    http.securityContext(context -> context.securityContextRepository(repository));
    http.sessionManagement(
        session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
    http.authorizeHttpRequests(authorize -> authorize.anyRequest().authenticated());
    return http.build();
  }

  private static void shared(HttpSecurity http, String pattern, SecurityProperties properties)
      throws Exception {
    http.securityMatcher(pattern);
    http.cors(cors -> cors.configurationSource(cors(properties)));
    CookieCsrfTokenRepository csrfTokens = CookieCsrfTokenRepository.withHttpOnlyFalse();
    csrfTokens.setCookieName(CSRF_COOKIE_NAME);
    csrfTokens.setHeaderName(CSRF_HEADER_NAME);
    csrfTokens.setCookieCustomizer(
        builder ->
            builder
                .httpOnly(false)
                .secure(true)
                .sameSite(properties.session().sameSite())
                .path("/"));
    http.csrf(
        csrf ->
            csrf.csrfTokenRepository(csrfTokens)
                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()));
    http.exceptionHandling(
        errors ->
            errors
                .authenticationEntryPoint(
                    (request, response, authException) ->
                        ProblemBodies.write(
                            response, ProblemBodies.of(ErrorCode.AUTHENTICATION_REQUIRED, request)))
                .accessDeniedHandler(
                    (request, response, accessDeniedException) ->
                        ProblemBodies.write(
                            response, ProblemBodies.of(ErrorCode.FORBIDDEN, request))));
    http.anonymous(AbstractHttpConfigurer::disable);
    http.formLogin(AbstractHttpConfigurer::disable);
    http.httpBasic(AbstractHttpConfigurer::disable);
    http.logout(AbstractHttpConfigurer::disable);
    http.requestCache(AbstractHttpConfigurer::disable);
  }

  private static CorsConfigurationSource cors(SecurityProperties properties) {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOrigins(new ArrayList<>(properties.cors().origins()));
    configuration.setAllowCredentials(true);
    // Browser preflight list, not an API method contract.
    configuration.setAllowedMethods(PREFLIGHT_METHODS);
    configuration.setAllowedHeaders(
        List.of(HttpHeaders.CONTENT_TYPE, RequestIds.HEADER, "X-XSRF-TOKEN"));
    configuration.setExposedHeaders(List.of(RequestIds.HEADER));
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/v1/operator/**", configuration);
    source.registerCorsConfiguration("/api/v1/participant/**", configuration);
    source.registerCorsConfiguration("/api/v1/public/**", configuration);
    return source;
  }
}
