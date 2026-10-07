package app.scene.identity.mapper;

import app.scene.identity.OperatorAccount;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper {

  OperatorAccount findById(UUID id);
}
