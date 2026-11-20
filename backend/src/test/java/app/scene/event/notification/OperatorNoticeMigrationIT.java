package app.scene.event.notification;

import static org.assertj.core.api.Assertions.assertThat;

import app.scene.support.PostgresTestcontainer;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * The migration that moves {@code operator_notices} into {@code notifications} (DEC-080 §7.6, §10;
 * I3 #436). A fresh database is migrated up to the version before it, old rows go in, then the rest
 * runs. The migration is found by its description, so renumbering it before merge needs no change.
 */
class OperatorNoticeMigrationIT {

  private static final String DESCRIPTION = "operator notices to notifications";

  @Test
  void oldNoticesArriveReadAndTheOldTableStays() throws Exception {
    try (PostgreSQLContainer db = new PostgreSQLContainer(PostgresTestcontainer.POSTGRES_IMAGE)) {
      db.start();
      MigrationVersion target = versionBefore(flyway(db, null));
      flyway(db, target).migrate();

      UUID spaceId = UUID.randomUUID();
      UUID eventId = UUID.randomUUID();
      UUID ownerId = UUID.randomUUID();
      UUID noticeId = UUID.randomUUID();
      Instant at = Instant.parse("2026-11-01T03:00:00Z");
      try (Connection c = connect(db)) {
        exec(c, "INSERT INTO spaces (id, name) VALUES (?, 'Home')", spaceId);
        exec(c, "INSERT INTO users (id, display_name) VALUES (?, 'Owner')", ownerId);
        exec(
            c,
            "INSERT INTO events (id, space_id, name, lifecycle_status) VALUES (?, ?, '행사', 'ACTIVE')",
            eventId,
            spaceId);
        exec(
            c,
            "INSERT INTO operator_notices (id, space_id, event_id, recipient_user_id, kind,"
                + " created_at) VALUES (?, ?, ?, ?, 'LIFECYCLE_OVERRIDE', ?)",
            noticeId,
            spaceId,
            eventId,
            ownerId,
            Timestamp.from(at));
      }

      flyway(db, null).migrate();

      try (Connection c = connect(db);
          PreparedStatement s =
              c.prepareStatement(
                  "SELECT recipient_kind, recipient_user_id, recipient_participant_id, kind,"
                      + " target_type, target_id, title, count, created_at, read_at"
                      + " FROM notifications WHERE id = ?")) {
        s.setObject(1, noticeId);
        try (ResultSet r = s.executeQuery()) {
          assertThat(r.next()).isTrue();
          assertThat(r.getString("recipient_kind")).isEqualTo("OPERATOR");
          assertThat(r.getObject("recipient_user_id", UUID.class)).isEqualTo(ownerId);
          assertThat(r.getObject("recipient_participant_id")).isNull();
          assertThat(r.getString("kind")).isEqualTo("LIFECYCLE_OVERRIDE");
          assertThat(r.getString("target_type")).isEqualTo("EVENT");
          assertThat(r.getObject("target_id", UUID.class)).isEqualTo(eventId);
          assertThat(r.getString("title")).isEqualTo("행사 상태를 공간 소유자가 바꿨어요");
          assertThat(r.getInt("count")).isEqualTo(1);
          assertThat(r.getTimestamp("created_at").toInstant()).isEqualTo(at);
          assertThat(r.getTimestamp("read_at").toInstant()).isEqualTo(at);
          assertThat(r.next()).isFalse();
        }
      }
      try (Connection c = connect(db);
          PreparedStatement s = c.prepareStatement("SELECT count(*) FROM operator_notices");
          ResultSet r = s.executeQuery()) {
        r.next();
        assertThat(r.getInt(1)).as("old table is kept for a rollback").isEqualTo(1);
      }
    }
  }

  private static MigrationVersion versionBefore(Flyway flyway) {
    MigrationVersion previous = null;
    for (MigrationInfo info : flyway.info().all()) {
      if (DESCRIPTION.equals(info.getDescription())) {
        assertThat(previous).isNotNull();
        return previous;
      }
      if (info.getVersion() != null) {
        previous = info.getVersion();
      }
    }
    throw new AssertionError("migration not found: " + DESCRIPTION);
  }

  private static Flyway flyway(PostgreSQLContainer db, MigrationVersion target) {
    var config =
        Flyway.configure()
            .dataSource(db.getJdbcUrl(), db.getUsername(), db.getPassword())
            .locations("classpath:db/migration");
    if (target != null) {
      config.target(target);
    }
    return config.load();
  }

  private static Connection connect(PostgreSQLContainer db) throws Exception {
    return DriverManager.getConnection(db.getJdbcUrl(), db.getUsername(), db.getPassword());
  }

  private static void exec(Connection c, String sql, Object... args) throws Exception {
    try (PreparedStatement s = c.prepareStatement(sql)) {
      for (int i = 0; i < args.length; i++) {
        s.setObject(i + 1, args[i]);
      }
      s.executeUpdate();
    }
  }
}
