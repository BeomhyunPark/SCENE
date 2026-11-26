import { describe, expect, it } from "vitest";
import { columnIndex, columnLetter, criterion, evaluate, shiftFormula, type Scalar } from "./formula";

/** A 3×4 sheet: A = name, B = number, C = paid. */
const cells: Scalar[][] = [
  ["김하나", 10, "입금"],
  ["박둘", 20, null],
  ["이셋", 30, "입금"],
  ["최넷", "12 명", "미입금"],
];
const resolver = { rowCount: cells.length, colCount: 3, cell: (c: number, r: number) => cells[r]?.[c] ?? null };
const run = (source: string) => evaluate(source, resolver);

describe("sheet formulas", () => {
  it("converts column letters both ways", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnIndex("AB")).toBe(27);
  });

  it("does arithmetic with precedence, percent, text joins and comparisons", () => {
    expect(run("1+2*3")).toBe(7);
    expect(run("(1+2)*3")).toBe(9);
    expect(run("2^3^2")).toBe(512);
    expect(run("-B1+5")).toBe(-5);
    expect(run("50%")).toBe(0.5);
    expect(run('A1&"님"')).toBe("김하나님");
    expect(run("B2>B1")).toBe(true);
    expect(run("1/0")).toEqual({ error: "#DIV/0!" });
  });

  it("sums, counts and averages ranges and whole columns", () => {
    expect(run("SUM(B1:B3)")).toBe(60);
    // "12 명" is text: a range adds numbers only.
    expect(run("SUM(B:B)")).toBe(60);
    expect(run("AVERAGE(B1:B3)")).toBe(20);
    expect(run("COUNTA(C:C)")).toBe(3);
    expect(run("COUNTBLANK(C1:C4)")).toBe(1);
    expect(run('COUNTIF(C:C,"입금")')).toBe(2);
    expect(run('COUNTIF(B:B,">=20")')).toBe(2);
    expect(run('COUNTIF(A:A,"*둘")')).toBe(1);
    expect(run('SUMIF(C1:C4,"입금",B1:B4)')).toBe(40);
    expect(run('COUNTIFS(C:C,"입금",B:B,">10")')).toBe(1);
    expect(run("MAX(B:B)")).toBe(30);
  });

  it("branches, looks up and handles text", () => {
    expect(run('IF(C2="","미입금","입금")')).toBe("미입금");
    expect(run('IFERROR(1/0,"없음")')).toBe("없음");
    expect(run('VLOOKUP("박둘",A1:C4,2,FALSE)')).toBe(20);
    expect(run('XLOOKUP("이셋",A:A,B:B)')).toBe(30);
    expect(run('LEFT(A1,1)&LEN(A3)')).toBe("김2");
    expect(run('TEXTJOIN(", ",TRUE,C1:C4)')).toBe("입금, 입금, 미입금");
    expect(run("ROUND(2/3,2)")).toBe(0.67);
  });

  it("reports unknown names and broken formulas as errors", () => {
    expect(run("NOPE(1)")).toEqual({ error: "#NAME?" });
    expect(run("SUM(1")).toEqual({ error: "#ERROR!" });
    expect(run("Z99")).toEqual({ error: "#REF!" });
  });

  it("moves relative references with the fill handle and keeps $ references", () => {
    expect(shiftFormula("=B2*$C$1+B:B", 0, 3)).toBe("=B5*$C$1+B:B");
    expect(shiftFormula("=SUM(A1:A3)", 1, 0)).toBe("=SUM(B1:B3)");
    expect(shiftFormula("=A1", 0, -1)).toBe("=#REF!");
  });

  it("reads COUNTIF criteria like Sheets", () => {
    expect(criterion("<>입금")("입금")).toBe(false);
    expect(criterion("")(null)).toBe(true);
    expect(criterion(">5")("12")).toBe(true);
    expect(criterion(5)(5)).toBe(true);
  });
});
