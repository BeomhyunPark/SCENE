import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../api/queryClient";

describe("PublicLogin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not render the dev login panel when DEV is off", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DEV_LOGIN", "1");
    const { PublicLogin } = await import("./PublicLogin");
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/login?next=/events"]}>
          <PublicLogin />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("heading", { name: "개발용 로그인" })).not.toBeInTheDocument();
    expect(screen.queryByText("개발 중에는 아래 개발용 로그인으로 들어가요.")).not.toBeInTheDocument();
  });
});
