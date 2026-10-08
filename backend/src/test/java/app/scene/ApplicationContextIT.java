package app.scene;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.common.mybatis.UuidProbeMapper;
import app.scene.common.mybatis.UuidTypeHandler;
import app.scene.support.PostgresTestcontainer;
import java.time.Clock;
import java.time.ZoneOffset;
import java.util.UUID;
import org.apache.ibatis.session.SqlSessionFactory;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;

/** Boots the full application against a Testcontainers PostgreSQL (postgres:17). */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class ApplicationContextIT {

  @Autowired Flyway flyway;
  @Autowired JdbcTemplate jdbcTemplate;
  @Autowired SqlSessionFactory sqlSessionFactory;
  @Autowired UuidProbeMapper uuidProbeMapper;
  @Autowired Clock clock;
  @Autowired Environment environment;

  @Test
  void connectsToPostgres17() {
    String version = jdbcTemplate.queryForObject("SHOW server_version", String.class);
    assertThat(version).startsWith("17.");
  }

  @Test
  void flywayAppliedBaselineMigration() {
    MigrationInfo current = flyway.info().current();
    assertThat(current).isNotNull();
    assertThat(current.getVersion().getVersion()).isEqualTo("4");

    Integer baseline =
        jdbcTemplate.queryForObject(
            "SELECT count(*) FROM flyway_schema_history WHERE version = '1' AND success",
            Integer.class);
    Integer sessions =
        jdbcTemplate.queryForObject(
            "SELECT count(*) FROM flyway_schema_history WHERE version = '2' AND success",
            Integer.class);
    Integer forms =
        jdbcTemplate.queryForObject(
            "SELECT count(*) FROM flyway_schema_history WHERE version = '3' AND success",
            Integer.class);
    Integer applications =
        jdbcTemplate.queryForObject(
            "SELECT count(*) FROM flyway_schema_history WHERE version = '4' AND success",
            Integer.class);
    assertThat(baseline).isEqualTo(1);
    assertThat(sessions).isEqualTo(1);
    assertThat(forms).isEqualTo(1);
    assertThat(applications).isEqualTo(1);
  }

  @Test
  void myBatisIsConfigured() {
    var configuration = sqlSessionFactory.getConfiguration();
    assertThat(configuration.isMapUnderscoreToCamelCase()).isTrue();
    assertThat(configuration.getTypeHandlerRegistry().getTypeHandler(UUID.class))
        .isInstanceOf(UuidTypeHandler.class);
  }

  @Test
  void uuidRoundTripsThroughMyBatis() {
    UUID id = UUID.randomUUID();
    assertThat(uuidProbeMapper.echo(id)).isEqualTo(id);
    assertThat(uuidProbeMapper.boundType(id)).isEqualTo("uuid");
  }

  @Test
  void clockIsUtc() {
    assertThat(clock.getZone()).isEqualTo(ZoneOffset.UTC);
  }

  @Test
  void testsDoNotActivateDeployProfiles() {
    assertThat(environment.getActiveProfiles()).doesNotContain("local", "dev", "stg", "prod");
  }
}
