package app.scene.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Shared PostgreSQL Testcontainer for integration tests. Import it with
 * {@code @Import(PostgresTestcontainer.class)}; {@link ServiceConnection} wires the datasource, and
 * Spring's test context cache reuses the container across test classes with the same context.
 */
@TestConfiguration(proxyBeanMethods = false)
public class PostgresTestcontainer {

  public static final DockerImageName POSTGRES_IMAGE = DockerImageName.parse("postgres:17");

  @Bean
  @ServiceConnection
  PostgreSQLContainer postgresContainer() {
    return new PostgreSQLContainer(POSTGRES_IMAGE);
  }
}
