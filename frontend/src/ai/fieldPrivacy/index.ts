import { localRuleChecker } from "./localRuleChecker";
import type { FieldPrivacyChecker } from "./types";

export { localRuleChecker };
export type { FieldPrivacyChecker, FieldPrivacyInput, PrivacyCategory, PrivacyFinding } from "./types";

export const fieldPrivacyChecker: FieldPrivacyChecker = localRuleChecker;
