package app.scene.space.mapper;

import app.scene.space.param.TransferCompleteUpdate;
import app.scene.space.param.TransferStatusQuery;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MembershipTransferMapper {

  int countPendingFrom(TransferStatusQuery query);

  int updateCompleted(TransferCompleteUpdate update);
}
