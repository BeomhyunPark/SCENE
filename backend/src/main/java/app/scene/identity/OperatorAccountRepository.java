package app.scene.identity;

import app.scene.identity.mapper.UserMapper;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class OperatorAccountRepository {

  private final UserMapper users;

  public OperatorAccountRepository(UserMapper users) {
    this.users = users;
  }

  public Optional<OperatorAccount> findById(UUID id) {
    return Optional.ofNullable(users.findById(id));
  }
}
