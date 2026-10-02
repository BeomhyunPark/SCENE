package app.scene;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.support.PostgresTestcontainer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * The local profile points Flyway at the seed folder. ServiceConnection still supplies the
 * database, so this does not use the compose instance on localhost.
 */
@SpringBootTest
@ActiveProfiles("local")
@Import(PostgresTestcontainer.class)
class LocalSeedIT {

  private static final String SPACE = "00000000-0000-4000-8000-000000000010";
  private static final String EVENT = "00000000-0000-4000-8000-000000000020";

  @Autowired JdbcTemplate jdbc;

  @Test
  void localProfileLoadsTheFixtureWithoutPermissionOverrides() {
    assertThat(count("users")).isEqualTo(3);
    assertThat(count("spaces")).isEqualTo(1);
    assertThat(countWhere("members", "space_id", SPACE)).isEqualTo(3);
    assertThat(status()).isEqualTo("DRAFT");
    assertThat(countWhere("event_users", "event_id", EVENT)).isEqualTo(3);
    assertThat(invitationStatus()).isEqualTo("PENDING");
    assertThat(count("event_user_permissions")).isZero();
    assertThat(flywayVersion()).isEqualTo("1");
    assertThat(seedApplied()).isEqualTo(1);
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  private int countWhere(String table, String column, String id) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM " + table + " WHERE " + column + " = ?::uuid", Integer.class, id);
  }

  private String status() {
    return jdbc.queryForObject(
        "SELECT lifecycle_status FROM events WHERE id = ?::uuid", String.class, EVENT);
  }

  private String invitationStatus() {
    return jdbc.queryForObject(
        "SELECT status FROM event_invitations WHERE id = '00000000-0000-4000-8000-000000000030'",
        String.class);
  }

  private String flywayVersion() {
    return jdbc.queryForObject(
        "SELECT version FROM flyway_schema_history WHERE version = '1' AND success", String.class);
  }

  private int seedApplied() {
    return jdbc.queryForObject(
        "SELECT count(*) FROM flyway_schema_history WHERE script = 'R__local_seed.sql' AND success",
        Integer.class);
  }
}
