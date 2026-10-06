package app.scene.identity;

import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface OperatorAccountMapper {

  @Select(
      """
      SELECT id, display_name
      FROM users
      WHERE id = #{id}
      """)
  OperatorAccount findById(UUID id);
}
