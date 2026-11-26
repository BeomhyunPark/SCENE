import { useState } from "react";
import { newSheetId, type SheetRule, type SheetRuleOp } from "../../api/rosterSheet";
import { Button } from "../Button";
import { Select } from "../Select";
import type { ColumnDef } from "./model";
import { RULE_LABELS } from "./sheet";

const NEEDS_VALUE: SheetRuleOp[] = ["eq", "neq", "contains", "notContains", "gt", "gte", "lt", "lte"];

/**
 * 조건부 서식 (#509): rules on a whole column, shared by the operators. A cell that matches takes the
 * rule's fill and text color over its own format; later rules win.
 */
export function RulesPanel({
  columns,
  rules,
  initial,
  mayWrite,
  onChange,
  onClose,
}: {
  columns: ColumnDef[];
  rules: SheetRule[];
  initial: string | null;
  mayWrite: boolean;
  onChange: (rules: SheetRule[]) => void;
  onClose: () => void;
}) {
  const [col, setCol] = useState(initial && columns.some((column) => column.id === initial) ? initial : (columns[0]?.id ?? ""));
  const [op, setOp] = useState<SheetRuleOp>("empty");
  const [value, setValue] = useState("");
  const [fill, setFill] = useState("#fce8e6");
  const [color, setColor] = useState("#b00020");
  const label = (id: string) => columns.find((column) => column.id === id)?.label ?? "숨긴 열";

  return (
    <div className="roster__panel sheet-rules" role="group" aria-label="조건부 서식">
      {rules.length > 0 ? (
        <ul className="sheet-rules" aria-label="걸린 규칙">
          {rules.map((rule) => (
            <li key={rule.id} className="sheet-rules__row">
              <span className="sheet-rules__preview" style={{ background: rule.fill, color: rule.color, fontWeight: rule.b ? 700 : undefined }}>
                {label(rule.col)}: {RULE_LABELS[rule.op]}
                {NEEDS_VALUE.includes(rule.op) ? ` "${rule.value}"` : ""}
              </span>
              {mayWrite ? (
                <button
                  type="button"
                  className="roster__link scene-press scene-press--text"
                  onClick={() => onChange(rules.filter((item) => item.id !== rule.id))}
                >
                  빼기
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="roster__hint">아직 규칙이 없어요.</p>
      )}
      {mayWrite ? (
        <form
          className="sheet-rules__row"
          onSubmit={(event) => {
            event.preventDefault();
            if (!col) return;
            onChange([...rules, { id: newSheetId(), col, op, value: NEEDS_VALUE.includes(op) ? value : "", fill, color }]);
            setValue("");
          }}
        >
          <Select aria-label="열" value={col} options={columns.map((column) => ({ value: column.id, label: column.label }))} onChange={setCol} />
          <Select
            aria-label="조건"
            value={op}
            options={(Object.keys(RULE_LABELS) as SheetRuleOp[]).map((key) => ({ value: key, label: RULE_LABELS[key] }))}
            onChange={(next) => setOp(next as SheetRuleOp)}
          />
          {NEEDS_VALUE.includes(op) ? (
            <input type="text" aria-label="값" value={value} maxLength={200} onChange={(event) => setValue(event.target.value)} />
          ) : null}
          <label className="sheet-rules__row">
            채우기
            <input type="color" value={fill} onChange={(event) => setFill(event.target.value)} />
          </label>
          <label className="sheet-rules__row">
            글자
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
          <Button type="submit" variant="secondary" size={40}>
            규칙 더하기
          </Button>
        </form>
      ) : null}
      <div>
        <button type="button" className="roster__link scene-press scene-press--text" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
