import { eventHandlers } from "./events";
import { formHandlers } from "./forms";
import { lifecycleHandlers } from "./lifecycle";
import { operatorHandlers } from "./operators";
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
  ...lifecycleHandlers,
];
