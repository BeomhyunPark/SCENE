package app.scene.common.mybatis;

import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** Test-only mapper that round-trips a UUID through PostgreSQL. */
@Mapper
public interface UuidProbeMapper {

  @Select("SELECT CAST(#{id} AS uuid)")
  UUID echo(@Param("id") UUID id);

  @Select("SELECT pg_typeof(#{id})::text")
  String boundType(@Param("id") UUID id);
}
