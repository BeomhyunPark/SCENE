import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FormField } from "../../api/forms";
import { ConditionPicker } from "./ConditionPicker";

const attendance: FormField = {
  fieldId: "att",
  kind: "CUSTOM",
  systemKey: null,
  label: "참석 방식",
  position: 3,
  answerType: "SINGLE_CHOICE",
  required: true,
  description: null,
  config: { options: [{ optionId: "opt_full", label: "전체 참석", group: null, hidden: false, showWhen: null }] },
  showWhen: null,
  hidden: false,
  presetKey: "ATTENDANCE",
  presetActive: true,
};

describe("ConditionPicker with anyOf (#328)", () => {
  it("shows the server's anyOf in words and offers no control", () => {
    render(
      <ConditionPicker
        id="c"
        label="보기 1 표시 조건"
        value={{ anyOf: [{ fieldId: "att", optionIds: ["opt_full"] }, { fieldId: "gone", optionIds: ["x"] }] }}
        targets={[attendance]}
        onChange={() => undefined}
      />,
    );
    expect(
      screen.getByText("'참석 방식'이(가) 전체 참석일 때 또는 조건 대상 질문이 없어요 보여요. 이 조건은 여기서 바꿀 수 없어요."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
