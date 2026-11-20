import { applicationHandlers } from "./applications";
import { checkInHandlers } from "./checkIns";
import { eventHandlers } from "./events";
import { formHandlers } from "./forms";
import { groupHandlers } from "./groups";
import { invitationHandlers } from "./invitations";
import { lifecycleHandlers } from "./lifecycle";
import { notificationHandlers } from "./notifications";
import { retrospectiveHandlers } from "./retrospective";
import { scheduleHandlers } from "./schedule";
import { operatorHandlers } from "./operators";
import { participantHandlers } from "./participant";
import { participantCheckInHandlers } from "./participantCheckIn";
import { participantGroupHandlers } from "./participantGroup";
import { participantHomeHandlers } from "./participantHome";
import { sessionHandlers } from "./session";
import { spaceHandlers } from "./spaces";
import { spaceInvitationHandlers } from "./spaceInvitations";
import { taskHandlers } from "./tasks";

export const handlers = [
  ...sessionHandlers,
  ...spaceHandlers,
  ...eventHandlers,
  ...operatorHandlers,
  ...invitationHandlers,
  ...spaceInvitationHandlers,
  ...taskHandlers,
  ...formHandlers,
  ...participantHandlers,
  ...participantCheckInHandlers,
  ...participantGroupHandlers,
  ...participantHomeHandlers,
  ...applicationHandlers,
  ...lifecycleHandlers,
  ...retrospectiveHandlers,
  ...checkInHandlers,
  ...groupHandlers,
  ...scheduleHandlers,
  ...notificationHandlers,
];
