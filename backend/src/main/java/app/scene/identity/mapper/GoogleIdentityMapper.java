package app.scene.identity.mapper;

import app.scene.identity.GoogleIdentityRow;
import java.time.Instant;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Google identities, new users, and the one-time bootstrap space (DEC-069). */
@Mapper
public interface GoogleIdentityMapper {

  GoogleIdentityRow findBySubject(String subject);

  int insertIdentity(
      @Param("subject") String subject,
      @Param("userId") UUID userId,
      @Param("email") String email,
      @Param("now") Instant now);

  int touchIdentity(
      @Param("subject") String subject, @Param("email") String email, @Param("now") Instant now);

  int insertUser(@Param("id") UUID id, @Param("displayName") String displayName);

  /** Serializes bootstrap checks across concurrent first sign-ins. */
  int lockBootstrap();

  int countSpaces();

  int insertSpace(@Param("id") UUID id, @Param("name") String name);

  int insertOwner(@Param("spaceId") UUID spaceId, @Param("userId") UUID userId);
}
