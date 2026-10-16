export type PrivacyCategory = "UNIQUE_ID" | "SENSITIVE" | "FINANCIAL" | "ID_DOCUMENT";

export type PrivacyFinding = {
  category: PrivacyCategory;
  matched: string;
  message: string;
  suggestion: string;
};

export type FieldPrivacyInput = { label: string };

export interface FieldPrivacyChecker {
  checkFieldPrivacy(field: FieldPrivacyInput, options?: { signal?: AbortSignal }): Promise<PrivacyFinding[]>;
}
