import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { login } from "../api/session";
import { localEvent, localUsers } from "../mocks/fixtures/seed";
import { createForm, setAccepting } from "../mocks/formStore";
import { setLifecycle } from "../mocks/operatorStore";
import { submitPublicApplication } from "../mocks/participantStore";

const EVENT = localEvent.eventId;
const OWNER = localUsers[0].userId;
const WAIT = { timeout: 4000 };
const NAME = "윤상세";

function seedApplicant(): string {
  const form = createForm(EVENT, OWNER, {});
  if ("code" in form) throw new Error(form.code);
  setLifecycle(EVENT, "ACTIVE", 1);
  const opened = setAccepting(EVENT, form.formId, OWNER, { acceptingApplications: true });
  if ("code" in opened) throw new Error(opened.code);
  const nameField = form.fields.find((field) => field.label === "이름")!;
  const phoneField = form.fields.find((field) => field.label === "전화")!;
  const submitted = submitPublicApplication(EVENT, form.formId, {
    answers: [
      { fieldId: nameField.fieldId, text: NAME },
      { fieldId: phoneField.fieldId, text: "010-2222-0101" },
    ],
    pin: "730914",
  });
  if ("code" in submitted) throw new Error(submitted.code);
  return submitted.applicationId;
}

async function openAt(path: string) {
  await login({ userId: OWNER });
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** I6 (#348): the name opens the same 신청 상세, and its back arrow returns to the screen it came from. */
describe("participant name opens the same 신청 상세", () => {
  for (const [screenName, segment] of [
    ["현장 운영", "field"],
    ["조 편성", "groups"],
    ["숙소", "rooms"],
  ] as const) {
    it(`from ${screenName}`, async () => {
      const applicationId = seedApplicant();
      await openAt(`/events/${EVENT}/${segment}`);
      const links = await screen.findAllByRole("link", { name: NAME }, WAIT);
      expect(links[0]).toHaveAttribute("href", `/events/${EVENT}/participants/${applicationId}`);
      fireEvent.click(links[0]);
      const answers = await screen.findByRole("region", { name: "신청 내용" }, WAIT);
      expect(within(answers).getByText(NAME)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("link", { name: "이전 화면" }));
      expect(await screen.findAllByRole("link", { name: NAME }, WAIT)).not.toHaveLength(0);
      expect(screen.queryByRole("region", { name: "신청 내용" })).not.toBeInTheDocument();
    });
  }

  it("keeps the 참가 현황 back arrow when opened from anywhere else", async () => {
    const applicationId = seedApplicant();
    await openAt(`/events/${EVENT}/participants/${applicationId}`);
    expect(await screen.findByRole("link", { name: "신청자 목록" }, WAIT)).toHaveAttribute("href", `/events/${EVENT}/participants`);
  });
});
