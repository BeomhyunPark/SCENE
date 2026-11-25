import { fireEvent, within } from "@testing-library/react";

/** 공용 Select(role="combobox")를 열고 value가 같은 옵션을 누른다. 기본 select의 change 이벤트를 대신한다. */
export function chooseOption(trigger: HTMLElement, value: string): void {
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
  const listId = trigger.getAttribute("aria-controls");
  const list = listId ? document.getElementById(listId) : null;
  if (!list) throw new Error("listbox not found for the combobox");
  const option = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (item) => item.dataset.value === value,
  );
  if (!option) {
    const values = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]')).map((item) => item.dataset.value);
    throw new Error(`option "${value}" not found; options: ${values.join(", ")}`);
  }
  fireEvent.click(option);
}

/** 공용 Select가 지금 가진 값. 기본 select의 toHaveValue를 대신한다. */
export function selectValue(trigger: HTMLElement): string | undefined {
  return trigger.dataset.value;
}

/** 열어서 옵션 이름을 차례로 읽는다(트리거를 한 번 더 눌러 다시 닫는다). */
export function optionLabels(trigger: HTMLElement): string[] {
  const wasOpen = trigger.getAttribute("aria-expanded") === "true";
  if (!wasOpen) fireEvent.click(trigger);
  const list = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
  const labels = Array.from(list?.querySelectorAll<HTMLElement>('[role="option"]') ?? []).map((item) => item.textContent ?? "");
  if (!wasOpen) fireEvent.click(trigger);
  return labels;
}

/** 옵션 이름(글자 또는 정규식)으로 고른다. */
export function chooseOptionByLabel(trigger: HTMLElement, label: string | RegExp): void {
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
  const list = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
  const option = Array.from(list?.querySelectorAll<HTMLElement>('[role="option"]') ?? []).find((item) => {
    const text = item.textContent ?? "";
    return typeof label === "string" ? text === label : label.test(text);
  });
  if (!option) throw new Error(`option ${String(label)} not found`);
  fireEvent.click(option);
}

/**
 * 열어 둔 채로 옵션이 나타날 때까지 기다린 뒤 다시 닫는다.
 * waitFor 안에서 optionLabels를 부르면 열고 닫는 변화가 waitFor를 다시 깨워 끝없이 돈다. 늦게 오는 옵션은 이것으로 기다린다.
 */
export async function findOptionLabel(trigger: HTMLElement, label: string, options?: { timeout?: number }): Promise<void> {
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
  const list = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
  if (!list) throw new Error("listbox not found for the combobox");
  await within(list).findByRole("option", { name: label }, options);
  fireEvent.click(trigger);
}
