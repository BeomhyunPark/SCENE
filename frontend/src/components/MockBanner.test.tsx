import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { noteMockResponse, resetMockNoticeForTests } from "../api/mockNotice";
import { MockBanner } from "./MockBanner";

describe("MockBanner", () => {
  it("does not render when mock mode is off", () => {
    vi.stubEnv("VITE_API_MOCK", "0");
    render(<MockBanner />);
    expect(screen.queryByText("목업 데이터로 보고 있어요")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("renders the mock copy and appends the unverified note", () => {
    vi.stubEnv("VITE_API_MOCK", "1");
    resetMockNoticeForTests();
    const { unmount } = render(<MockBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("목업 데이터로 보고 있어요");
    expect(screen.getByRole("status")).not.toHaveTextContent("서버 미검증 호출이 있어요");
    unmount();

    noteMockResponse(new Headers({ "x-scene-mock": "unverified" }));
    render(<MockBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "목업 데이터로 보고 있어요 서버 미검증 호출이 있어요",
    );
    resetMockNoticeForTests();
    vi.unstubAllEnvs();
  });
});
