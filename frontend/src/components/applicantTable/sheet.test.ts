import { describe, expect, it } from "vitest";
import { EMPTY_DOC } from "../../api/rosterSheet";
import { fillSeries, layoutOf, Workbook, parseClipboard, placeOperatorColumns, toA1, toStored } from "./sheet";

describe("sheet layout", () => {
  const layout = layoutOf(["person", "c:pay", "status"], ["p:1", "p:2", "r:sum"]);

  it("stores formulas with ids and shows them in the reader's letters", () => {
    const stored = toStored("=SUM(B1:B2)+$C$3+B:B", layout);
    expect(stored).toBe("=SUM([[c:pay@p:1]]:[[c:pay@p:2]])+[[$status@$r:sum]]+[[c:pay]]:[[c:pay]]");
    expect(toA1(stored, layout)).toBe("=SUM(B1:B2)+$C$3+B:B");
    // Another reader shows the columns in another order: the formula follows the columns.
    const moved = layoutOf(["person", "status", "c:pay"], ["p:2", "p:1", "r:sum"]);
    expect(toA1(stored, moved)).toBe("=SUM(C2:C1)+$B$3+C:C");
    // A deleted row reads #REF!.
    expect(toA1(stored, layoutOf(["person", "c:pay", "status"], ["p:1", "r:sum"]))).toContain("#REF!");
    expect(toStored("그냥 글", layout)).toBe("그냥 글");
  });

  it("puts operator columns next to the column they were added after, unless hidden or moved", () => {
    const doc = {
      ...EMPTY_DOC,
      columns: [
        { id: "a", label: "입금", after: "status" },
        { id: "b", label: "차량", after: null },
        { id: "c", label: "메모2", after: "c:a" },
      ],
    };
    expect(placeOperatorColumns(["person", "status", "group"], doc)).toEqual(["person", "status", "c:a", "c:c", "group", "c:b"]);
    // A hidden column stays out; one added next to it goes to the end.
    expect(placeOperatorColumns(["person", "c:b", "status"], doc, ["c:a"])).toEqual(["person", "c:b", "status", "c:c"]);
  });

  it("reads clipboard text from Sheets with quoted cells", () => {
    expect(parseClipboard('a\tb\n"줄\n바꿈"\tc\n')).toEqual([
      ["a", "b"],
      ["줄\n바꿈", "c"],
    ]);
  });

  it("continues number runs and repeats anything else", () => {
    expect(fillSeries(["1", "2"], 3)).toEqual(["3", "4", "5"]);
    expect(fillSeries(["입금"], 2)).toEqual(["입금", "입금"]);
    expect(fillSeries(["a", "b"], 3)).toEqual(["a", "b", "a"]);
  });
});

describe("workbook", () => {
  const rowsOf = (ids: string[]) => ids.map((id, index) => ({ kind: "operator" as const, key: `r:${id}`, id, number: index + 1 }));

  it("lets a total under its own column skip itself", () => {
    const doc = {
      ...EMPTY_DOC,
      columns: [{ id: "pay", label: "회비", after: null }],
      rows: [{ id: "a" }, { id: "b" }, { id: "c" }],
      cells: {
        "r:a|c:pay": { v: "100" },
        "r:b|c:pay": { v: "50" },
        "r:c|c:pay": { v: "=SUM([[c:pay]]:[[c:pay]])" },
      },
    };
    const book = new Workbook(doc, [], ["c:pay"], rowsOf(["a", "b", "c"]));
    expect(book.display("r:c", "c:pay")).toBe("150");
    expect(book.raw("r:c", "c:pay")).toBe("=SUM(A:A)");
  });

  it("keeps a direct self reference circular", () => {
    const doc = { ...EMPTY_DOC, columns: [{ id: "x", label: "x", after: null }], rows: [{ id: "a" }], cells: { "r:a|c:x": { v: "=[[c:x@r:a]]+1" } } };
    const book = new Workbook(doc, [], ["c:x"], rowsOf(["a"]));
    expect(book.value("r:a", "c:x")).toEqual({ error: "#CIRC!" });
  });
});
