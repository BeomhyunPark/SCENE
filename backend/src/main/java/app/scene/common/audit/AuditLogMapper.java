package app.scene.common.audit;

import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AuditLogMapper {

  void save(AuditLog log);
}
