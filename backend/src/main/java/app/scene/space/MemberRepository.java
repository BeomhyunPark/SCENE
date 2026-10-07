package app.scene.space;

import app.scene.space.mapper.MemberMapper;
import app.scene.space.param.MemberQuery;
import app.scene.space.param.MemberStatusUpdate;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class MemberRepository {

  private static final String ACTIVE = "ACTIVE";
  private static final String LEFT = "LEFT";
  private static final String OWNER = "OWNER";

  private final MemberMapper members;

  public MemberRepository(MemberMapper members) {
    this.members = members;
  }

  public int countActive(UUID spaceId, UUID userId) {
    return members.count(MemberQuery.of(spaceId, userId, ACTIVE, null, false));
  }

  public int countOtherOwners(UUID spaceId, UUID userId) {
    return members.count(MemberQuery.of(spaceId, userId, ACTIVE, OWNER, true));
  }

  public int countOwners(UUID spaceId, UUID userId) {
    return members.count(MemberQuery.of(spaceId, userId, ACTIVE, OWNER, false));
  }

  @Transactional
  public int updateLeft(UUID spaceId, UUID userId) {
    return members.updateLeft(MemberStatusUpdate.of(spaceId, userId, LEFT, ACTIVE));
  }
}
