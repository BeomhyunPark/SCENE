import { applicationHandlers } from "./applications";
import { checkInHandlers } from "./checkIns";
import { eventHandlers } from "./events";
import { formHandlers } from "./forms";
import { groupHandlers } from "./groups";
import { invitationHandlers } from "./invitations";
import { lifecycleHandlers } from "./lifecycle";
import { mealCountHandlers } from "./mealCounts";
import { notificationHandlers } from "./notifications";
import { retrospectiveHandlers } from "./retrospective";
import { rosterSheetHandlers } from "./rosterSheet";
import { roomBoardHandlers } from "./roomBoard";
import { scheduleHandlers } from "./schedule";
import { noticeHandlers } from "./notices";
import { operatorHandlers } from "./operators";
import { participantHandlers } from "./participant";
import { participantCheckInHandlers } from "./participantCheckIn";
import { participantGroupHandlers } from "./participantGroup";
import { participantHomeHandlers } from "./participantHome";
import { participantNotificationHandlers } from "./participantNotifications";
import { participantRoomHandlers } from "./participantRooms";
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
  ...participantNotificationHandlers,
  ...participantRoomHandlers,
  ...applicationHandlers,
  ...mealCountHandlers,
  ...lifecycleHandlers,
  ...retrospectiveHandlers,
  ...rosterSheetHandlers,
  ...noticeHandlers,
  ...checkInHandlers,
  ...groupHandlers,
  ...roomBoardHandlers,
  ...scheduleHandlers,
  ...notificationHandlers,
];
