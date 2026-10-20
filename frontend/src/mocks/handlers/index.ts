import { eventHandlers } from "./events";
import { formHandlers } from "./forms";
import { lifecycleHandlers } from "./lifecycle";
import { retrospectiveHandlers } from "./retrospective";
import { operatorHandlers } from "./operators";
import { participantHandlers } from "./participant";
import { sessionHandlers } from "./session";
import { spaceHandlers } from "./spaces";
import { taskHandlers } from "./tasks";

export const handlers = [
  ...sessionHandlers,
  ...spaceHandlers,
  ...eventHandlers,
  ...operatorHandlers,
  ...taskHandlers,
  ...formHandlers,
  ...participantHandlers,
  ...lifecycleHandlers,
  ...retrospectiveHandlers,
];
