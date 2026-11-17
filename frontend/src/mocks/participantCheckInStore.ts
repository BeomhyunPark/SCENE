import { readRoster } from "./checkInStore";
import { localUsers } from "./fixtures/seed";
import { eventById } from "./operatorStore";

/**
 * Shaped like ParticipantCheckInController (#283). The value follows backend/docs/api.md "QR 값":
 * `SCENE-CI1.` + base64url(participant id 16 bytes ‖ HMAC-SHA256(secret, `checkin|1|{eventId}|{participantId}|0`)
 * first 16 bytes). The mock secret is not the server's, so only the mock operator scan can read it.
 */
const MOCK_SECRET = "scene-mock-checkin-secret";
const PREFIX = "SCENE-CI1.";

let secret: string | null = MOCK_SECRET;

export function resetParticipantCheckInStore(): void {
  secret = MOCK_SECRET;
}

/** Test seam: an empty SCENE_CHECKIN_CODE_SECRET, which makes AVAILABLE a 404. */
export function setParticipantCheckInSecret(next: string | null): void {
  secret = next;
}

export type ParticipantCheckInResult =
  | { status: "AVAILABLE" | "NOT_STARTED" | "ENDED" | "NOT_ELIGIBLE"; code: string | null; checkedIn: boolean; checkedInAt: string | null }
  | { failure: { status: number; code: string } };

export async function readParticipantCheckIn(eventId: string, participantId: string): Promise<ParticipantCheckInResult> {
  const event = eventById(eventId);
  if (!event) return { failure: { status: 404, code: "RESOURCE_NOT_FOUND" } };
  const row = rosterRow(eventId, participantId);
  const checkedIn = row?.checkIn?.status === "CHECKED_IN";
  const arrival = { checkedIn, checkedInAt: checkedIn ? row!.checkIn!.checkedInAt : null };
  const lifecycle = String(event.lifecycleStatus);
  if (lifecycle === "DRAFT") return { status: "NOT_STARTED", code: null, ...arrival };
  if (lifecycle === "ENDED" || lifecycle === "ARCHIVED") return { status: "ENDED", code: null, ...arrival };
  if (!row) return { status: "NOT_ELIGIBLE", code: null, ...arrival };
  if (!secret) return { failure: { status: 404, code: "RESOURCE_NOT_FOUND" } };
  return { status: "AVAILABLE", code: await signedCode(secret, eventId, participantId), ...arrival };
}

/** Builds the same value the server would, given the same secret. */
export async function signedCode(key: string, eventId: string, participantId: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(`checkin|1|${eventId}|${participantId}|0`)),
  );
  const bytes = new Uint8Array(32);
  bytes.set(uuidBytes(participantId), 0);
  bytes.set(mac.slice(0, 16), 16);
  return PREFIX + base64url(bytes);
}

function rosterRow(eventId: string, participantId: string) {
  for (const user of localUsers) {
    const page = readRoster(eventId, user.userId, new URL("http://mock/?size=100"));
    if ("items" in page) return page.items.find((item) => item.participantId === participantId) ?? null;
  }
  return null;
}

function uuidBytes(id: string): Uint8Array {
  const hex = id.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0;
  return bytes;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
