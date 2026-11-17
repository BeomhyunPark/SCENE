import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraError, startQrCamera } from "./qrCamera";

function stubCamera(getUserMedia: () => Promise<MediaStream>, secure = true) {
  vi.stubGlobal("isSecureContext", secure);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CameraError) return error.reason;
    throw error;
  }
  throw new Error("expected a failure");
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("startQrCamera", () => {
  it("refuses outside a secure context without asking for the camera", async () => {
    const getUserMedia = vi.fn();
    stubCamera(getUserMedia, false);
    expect(await failure(startQrCamera(document.createElement("video"), () => {}))).toBe("insecure");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("says unsupported without mediaDevices", async () => {
    vi.stubGlobal("isSecureContext", true);
    expect(await failure(startQrCamera(document.createElement("video"), () => {}))).toBe("unsupported");
  });

  it.each([
    ["NotAllowedError", "denied"],
    ["NotFoundError", "no-camera"],
    ["OverconstrainedError", "no-camera"],
    ["NotReadableError", "busy"],
    ["TypeError", "failed"],
  ])("maps %s to %s", async (name, reason) => {
    stubCamera(() => Promise.reject(new DOMException("x", name)));
    expect(await failure(startQrCamera(document.createElement("video"), () => {}))).toBe(reason);
  });

  it("asks for the rear camera without audio", async () => {
    const getUserMedia = vi.fn(() => Promise.reject(new DOMException("x", "NotAllowedError")));
    stubCamera(getUserMedia);
    await failure(startQrCamera(document.createElement("video"), () => {}));
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.objectContaining({ facingMode: { ideal: "environment" } }) }),
    );
  });

  it("stops the tracks when the video cannot play", async () => {
    const track = { stop: vi.fn() };
    stubCamera(() => Promise.resolve({ getTracks: () => [track] } as unknown as MediaStream));
    const video = document.createElement("video");
    Object.defineProperty(video, "srcObject", { configurable: true, writable: true, value: null });
    video.play = () => Promise.reject(new Error("no"));
    expect(await failure(startQrCamera(video, () => {}))).toBe("failed");
    expect(track.stop).toHaveBeenCalled();
  });
});
