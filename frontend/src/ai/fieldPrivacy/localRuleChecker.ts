import { findingsFor } from "./localRules";
import type { FieldPrivacyChecker } from "./types";

export const localRuleChecker: FieldPrivacyChecker = {
  checkFieldPrivacy(field, options) {
    if (options?.signal?.aborted) return Promise.resolve([]);
    return Promise.resolve(findingsFor(field.label));
  },
};
