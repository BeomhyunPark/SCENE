package app.scene.space.invitation;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.tenant.OperatorAccess;
import app.scene.common.tenant.SpaceMembership;
import app.scene.common.web.ItemPage;
import app.scene.common.web.PageRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Active member list (DEC-076). Every active member sees name and role. Email is shown only to an
 * active space {@code OWNER} or {@code ADMIN}. No membership row is {@code 404 RESOURCE_NOT_FOUND},
 * a {@code LEFT} row is {@code 403 NOT_A_MEMBER}.
 */
@Service
public class SpaceMemberService {

  private final SpaceInvitationRepository members;
  private final OperatorAccess access;

  public SpaceMemberService(SpaceInvitationRepository members, OperatorAccess access) {
    this.members = members;
    this.access = access;
  }

  @Transactional(readOnly = true)
  public ItemPage<SpaceMemberItem> list(UUID actorId, UUID spaceId, Integer page, Integer size) {
    SpaceMembership membership = access.spaceMembership(actorId, spaceId);
    switch (membership.kind()) {
      case ABSENT -> throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
      case ENDED -> throw new SceneException(ErrorCode.NOT_A_MEMBER);
      case ACTIVE -> {}
    }
    boolean emails = membership.maySeeMemberEmails();
    PageRequest request = PageRequest.of(page, size);
    long total = members.countActiveMembers(spaceId);
    List<SpaceMemberItem> items = new ArrayList<>();
    for (SpaceMemberRow row : members.listActiveMembers(spaceId, request)) {
      items.add(
          new SpaceMemberItem(
              row.userId(), row.displayName(), row.role(), emails ? row.email() : null));
    }
    return ItemPage.of(items, request, total);
  }
}
