import { eventHandlers } from "./events";
import { sessionHandlers } from "./session";
import { spaceHandlers } from "./spaces";

export const handlers = [...sessionHandlers, ...spaceHandlers, ...eventHandlers];
