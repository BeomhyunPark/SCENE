import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type AriaAttributes,
  type KeyboardEvent,
} from "react";
import "./Select.css";

/**
 * 기본 <select>를 대신하는 SCENE 공용 Select.
 * 모양: Venture Selector(EOP 723:18126 · Wrapper / Menu 724:19358 · Menu Item 724:19152)를 따르고
 * 색·글자는 SCENE 토큰으로 옮겼다. 선택 표시는 SCENE Combobox / Option(38:74)처럼 오른쪽 체크로 한다.
 * 동작은 WAI-ARIA "select-only combobox" 패턴: 포커스는 트리거에 남고 aria-activedescendant로 옵션을 가리킨다.
 * 옵션이 적은 고정 목록용이라 검색 칸은 두지 않는다(SCENE Combobox 문서 38:21 AVOID WHEN: 작은 고정 목록).
 */
export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = {
  id?: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /** 고른 값이 목록에 없을 때 트리거에 보이는 글. */
  placeholder?: string;
  disabled?: boolean;
  /** 폼 제출에 값을 싣고 싶을 때 쓰는 이름. 숨은 input으로 함께 보낸다. */
  name?: string;
  /** 트리거 버튼에 붙는 클래스. 화면별 높이·폭·테두리를 이어 쓴다. */
  className?: string;
  title?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  "aria-required"?: AriaAttributes["aria-required"];
};

type Placement = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

const GAP = 4;
const EDGE = 8;
const PANEL_MAX = 272;
const PANEL_MIN_WIDTH = 160;
const TYPEAHEAD_RESET_MS = 600;

function nextEnabled(options: readonly SelectOption[], from: number, step: 1 | -1): number {
  for (let index = from + step; index >= 0 && index < options.length; index += step) {
    if (!options[index].disabled) return index;
  }
  return from;
}

function firstEnabled(options: readonly SelectOption[]): number {
  return options.findIndex((option) => !option.disabled);
}

function lastEnabled(options: readonly SelectOption[]): number {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) return index;
  }
  return -1;
}

function place(trigger: HTMLElement): Placement {
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const width = Math.min(Math.max(rect.width, PANEL_MIN_WIDTH), viewportWidth - EDGE * 2);
  const left = Math.min(Math.max(rect.left, EDGE), viewportWidth - EDGE - width);
  const below = viewportHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  if (below < Math.min(PANEL_MAX, 180) && above > below) {
    return { left, width, bottom: viewportHeight - rect.top + GAP, maxHeight: Math.min(PANEL_MAX, above) };
  }
  return { left, width, top: rect.bottom + GAP, maxHeight: Math.min(PANEL_MAX, Math.max(below, 120)) };
}

function CaretIcon() {
  return (
    <svg className="scene-select__caret" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="scene-select__check" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Select({
  id,
  value,
  options,
  onChange,
  placeholder = "",
  disabled = false,
  name,
  className,
  title,
  ...aria
}: SelectProps) {
  const generated = useId();
  const triggerId = id ?? `scene-select-${generated}`;
  const listId = `${triggerId}-listbox`;
  const optionId = (index: number) => `${triggerId}-option-${index}`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", timer: 0 as ReturnType<typeof setTimeout> | 0 });

  const [openState, setOpen] = useState(false);
  const [activeState, setActive] = useState(-1);
  // 비활성이 되거나 옵션이 줄어 가리키던 칸이 사라지면 닫힌 것으로 본다.
  const open = openState && !disabled && activeState < options.length;
  const active = open ? activeState : -1;
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [listName, setListName] = useState<string | undefined>(undefined);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const openAt = useCallback(
    (index: number) => {
      if (disabled || options.length === 0) return;
      const trigger = triggerRef.current;
      if (trigger) {
        setPlacement(place(trigger));
        const labelText = aria["aria-label"] ?? trigger.labels?.[0]?.textContent?.trim();
        setListName(labelText || undefined);
      }
      setActive(index >= 0 ? index : firstEnabled(options));
      setOpen(true);
    },
    [aria, disabled, options],
  );

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  const commit = useCallback(
    (index: number, byPointer = false) => {
      const option = options[index];
      if (!option || option.disabled) return;
      close();
      // 마우스·터치로 고르면 키보드 포커스 테두리 없이 트리거로 포커스를 돌린다.
      triggerRef.current?.focus(byPointer ? ({ focusVisible: false } as FocusOptions) : undefined);
      if (option.value !== value) onChange(option.value);
    },
    [close, onChange, options, value],
  );

  // 열린 동안 화면이 움직이면 패널 위치를 다시 잰다.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (triggerRef.current) setPlacement(place(triggerRef.current));
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // 바깥을 누르면 닫는다.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [close, open]);

  // 키보드로 고르는 옵션이 보이도록 목록을 굴린다.
  useEffect(() => {
    if (!open || active < 0) return;
    const node = document.getElementById(optionId(active));
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
    // optionId depends only on triggerId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open, triggerId]);

  useEffect(() => () => {
    if (typeahead.current.timer) clearTimeout(typeahead.current.timer);
  }, []);

  function matchTypeahead(char: string): number {
    const state = typeahead.current;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.text = "";
      state.timer = 0;
    }, TYPEAHEAD_RESET_MS);
    const repeated = state.text.length > 0 && [...state.text].every((letter) => letter === char);
    state.text += char;
    const query = repeated ? char : state.text;
    const from = open ? active : selectedIndex;
    const start = repeated || query.length === 1 ? from + 1 : Math.max(from, 0);
    const count = options.length;
    for (let step = 0; step < count; step += 1) {
      const index = (((start + step) % count) + count) % count;
      const option = options[index];
      if (!option.disabled && option.label.trim().toLocaleLowerCase().startsWith(query.toLocaleLowerCase())) return index;
    }
    return -1;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const { key } = event;
    const printable = key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    const typing = typeahead.current.text.length > 0;

    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || (key === " " && !typing)) {
        event.preventDefault();
        openAt(selectedIndex >= 0 ? selectedIndex : firstEnabled(options));
        return;
      }
      if (key === "Home") {
        event.preventDefault();
        openAt(firstEnabled(options));
        return;
      }
      if (key === "End") {
        event.preventDefault();
        openAt(lastEnabled(options));
        return;
      }
      if (printable) {
        event.preventDefault();
        const match = matchTypeahead(key);
        openAt(match >= 0 ? match : selectedIndex);
      }
      return;
    }

    switch (key) {
      case "ArrowDown":
        event.preventDefault();
        if (event.altKey) return;
        setActive((current) => nextEnabled(options, current, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        if (event.altKey) {
          commit(active);
          return;
        }
        setActive((current) => nextEnabled(options, current, -1));
        return;
      case "Home":
        event.preventDefault();
        setActive(firstEnabled(options));
        return;
      case "End":
        event.preventDefault();
        setActive(lastEnabled(options));
        return;
      case "PageDown":
        event.preventDefault();
        setActive((current) => {
          let index = current;
          for (let step = 0; step < 10; step += 1) index = nextEnabled(options, index, 1);
          return index;
        });
        return;
      case "PageUp":
        event.preventDefault();
        setActive((current) => {
          let index = current;
          for (let step = 0; step < 10; step += 1) index = nextEnabled(options, index, -1);
          return index;
        });
        return;
      case "Enter":
        event.preventDefault();
        commit(active);
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case "Tab":
        close();
        return;
      default:
        break;
    }
    if (key === " " && !typing) {
      event.preventDefault();
      commit(active);
      return;
    }
    if (printable) {
      event.preventDefault();
      const match = matchTypeahead(key);
      if (match >= 0) setActive(match);
    }
  }

  const triggerClass = ["scene-select__trigger", selected ? "" : "scene-select__trigger--empty", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="scene-select">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        className={triggerClass}
        title={title}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        data-value={value}
        {...aria}
        onClick={() => (open ? close() : openAt(selectedIndex >= 0 ? selectedIndex : firstEnabled(options)))}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next && listRef.current?.contains(next)) return;
          close();
        }}
      >
        <span className="scene-select__value">{selected ? selected.label : placeholder}</span>
        <CaretIcon />
      </button>
      {name ? <input type="hidden" name={name} value={value} disabled={disabled} /> : null}
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={open ? listName : undefined}
        tabIndex={-1}
        hidden={!open}
        className={`scene-select__panel${placement?.bottom !== undefined ? " scene-select__panel--up" : ""}`}
        style={
          placement
            ? {
                left: placement.left,
                width: placement.width,
                maxHeight: placement.maxHeight,
                top: placement.top,
                bottom: placement.bottom,
              }
            : undefined
        }
        // 옵션을 눌러도 포커스는 트리거에 남는다. 감싼 <label>이 클릭을 트리거로 다시 보내지 않게 막는다.
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => event.preventDefault()}
      >
        {open
          ? options.map((option, index) => {
              const isSelected = index === selectedIndex;
              const classes = [
                "scene-select__option",
                index === active ? "scene-select__option--active" : "",
                isSelected ? "scene-select__option--selected" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li
                  key={`${option.value}-${index}`}
                  id={optionId(index)}
                  role="option"
                  className={classes}
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  data-value={option.value}
                  onMouseMove={() => {
                    if (!option.disabled && active !== index) setActive(index);
                  }}
                  onClick={() => commit(index, true)}
                >
                  <span className="scene-select__option-label">{option.label}</span>
                  {isSelected ? <CheckIcon /> : null}
                </li>
              );
            })
          : null}
      </ul>
    </div>
  );
}
