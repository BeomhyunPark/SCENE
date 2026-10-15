package app.scene.space;

import app.scene.common.tenant.OperatorAccessRepository;
import app.scene.common.tenant.SpaceMembershipListRow;
import app.scene.common.web.ItemPage;
import app.scene.common.web.PageRequest;
import app.scene.common.web.Sorts;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Spaces where the caller still has an active membership. There is no client sort. */
@Service
public class OperatorSpaceListService {

  private final OperatorAccessRepository access;

  public OperatorSpaceListService(OperatorAccessRepository access) {
    this.access = access;
  }

  public ItemPage<SpaceListItem> list(UUID userId, Integer page, Integer size, List<String> sort) {
    PageRequest request = PageRequest.of(page, size);
    Sorts.parse(sort, Set.of());
    long total = access.countSpaces(userId);
    List<SpaceListItem> items = new ArrayList<>();
    for (SpaceMembershipListRow row : access.findSpaces(userId, request)) {
      items.add(new SpaceListItem(row.spaceId(), row.name(), row.role()));
    }
    return ItemPage.of(items, request, total);
  }
}
