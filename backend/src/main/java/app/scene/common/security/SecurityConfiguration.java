package app.scene.common.security;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.ProblemBodies;
import app.scene.common.web.RequestIds;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.NullSecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Three filter chains. The operator chain stores its session in Spring Session JDBC. The
 * participant chain does not load that session or the in-memory stand-in. {@code /participant/me}
 * and logout read a separate cookie. Every other participant path stays unauthenticated. Public
 * does not require either session.
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
  ChainSessionRegistry participantSessions(SecurityProperties properties) {
    return new ChainSessionRegistry(
        properties.session().participantCookieName(), properties.session().sameSite());
  }

  /**
   * Operator session cookie. Names, SameSite, and the conceptual names stay on {@link
   * SecurityProperties}. Base64 is off so the cookie value is the JDBC session id.
   */
  @Bean
  DefaultCookieSerializer operatorSessionCookie(SecurityProperties properties) {
    DefaultCookieSerializer serializer = new DefaultCookieSerializer();
    serializer.setCookieName(properties.session().operatorCookieName());
    serializer.setUseHttpOnlyCookie(true);
    serializer.setUseSecureCookie(true);
    serializer.setSameSite(properties.session().sameSite());
    serializer.setCookiePath("/");
    serializer.setUseBase64Encoding(false);
    return serializer;
  }

  @Bean
  @Order(1)
  SecurityFilterChain operatorChain(HttpSecurity http, SecurityProperties properties)
      throws Exception {
    shared(http, "/api/v1/operator/**", properties);
    // Registered before session management so IF_REQUIRED keeps this repository.
    http.securityContext(
        context -> context.securityContextRepository(new HttpSessionSecurityContextRepository()));
    http.sessionManagement(
        session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED));
    http.authorizeHttpRequests(
        authorize ->
            authorize
                .requestMatchers(HttpMethod.POST, "/api/v1/operator/auth/login")
                .permitAll()
                .anyRequest()
                .authenticated());
    return http.build();
  }

  @Bean
  @Order(2)
  SecurityFilterChain participantChain(HttpSecurity http, SecurityProperties properties)
      throws Exception {
    shared(http, "/api/v1/participant/**", properties);
    http.securityContext(
        context -> context.securityContextRepository(new NullSecurityContextRepository()));
    http.sessionManagement(
        session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
    http.authorizeHttpRequests(
        authorize ->
            authorize
                .requestMatchers(HttpMethod.GET, "/api/v1/participant/me")
                .permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/participant/auth/logout")
                .permitAll()
                .anyRequest()
                .authenticated());
    return http.build();
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
