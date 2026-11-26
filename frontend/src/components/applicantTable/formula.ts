/**
 * Formulas of the 참가 현황 sheet (#509). A small spreadsheet language in A1 notation: numbers,
 * "text", TRUE/FALSE, cell refs (A1, $A$1), ranges (A1:B9) and whole columns (C:C), the operators
 * + - * / ^ & = <> < > <= >= and unary -, %, and the functions in FUNCTIONS. Evaluation goes
 * through a resolver, so this file knows nothing about applicants.
 */

export type ErrorValue = { error: "#DIV/0!" | "#VALUE!" | "#REF!" | "#NAME?" | "#N/A" | "#NUM!" | "#CIRC!" | "#ERROR!" };
export type Scalar = number | string | boolean | null | ErrorValue;
export type Value = Scalar | Scalar[][];

export const isError = (value: unknown): value is ErrorValue =>
  typeof value === "object" && value !== null && !Array.isArray(value) && "error" in value;

const err = (error: ErrorValue["error"]): ErrorValue => ({ error });

// --- A1 helpers ---

export function columnLetter(index: number): string {
  let out = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** A1 address of a zero-based cell. */
export function address(col: number, row: number): string {
  return `${columnLetter(col)}${row + 1}`;
}

// --- tokens ---

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "ref"; col: number; row: number; absCol: boolean; absRow: boolean; text: string }
  | { t: "colref"; col: number; absCol: boolean; text: string }
  | { t: "err"; v: ErrorValue["error"] }
  | { t: "name"; v: string }
  | { t: "op"; v: string }
  | { t: "("; }
  | { t: ")"; }
  | { t: ","; }
  | { t: ":"; };

const REF = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)(?![A-Za-z0-9_(])/;
const COLREF = /^(\$?)([A-Za-z]{1,3})(?=\s*:\s*\$?[A-Za-z]{1,3}(?![A-Za-z0-9]))/;
const COLREF_END = /^(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(])/;

/** Tokens of the text after "=". Keeps source spans so refs can be rewritten in place. */
export function tokenize(source: string): { tokens: Token[]; spans: [number, number][] } {
  const tokens: Token[] = [];
  const spans: [number, number][] = [];
  let i = 0;
  const push = (token: Token, start: number) => {
    tokens.push(token);
    spans.push([start, i]);
  };
  while (i < source.length) {
    const ch = source[i];
    const start = i;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let text = "";
      i++;
      while (i < source.length) {
        if (source[i] === '"') {
          if (source[i + 1] === '"') {
            text += '"';
            i += 2;
            continue;
          }
          break;
        }
        text += source[i++];
      }
      if (source[i] !== '"') throw new SyntaxError("unclosed string");
      i++;
      push({ t: "str", v: text }, start);
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const match = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(source.slice(i));
      if (!match) throw new SyntaxError("number");
      i += match[0].length;
      push({ t: "num", v: Number(match[0]) }, start);
      continue;
    }
    if (ch === "#") {
      const match = /^#(?:DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|CIRC!|ERROR!)/.exec(source.slice(i));
      if (!match) throw new SyntaxError("error literal");
      i += match[0].length;
      push({ t: "err", v: match[0] as ErrorValue["error"] }, start);
      continue;
    }
    const rest = source.slice(i);
    const ref = REF.exec(rest);
    if (ref) {
      i += ref[0].length;
      push(
        { t: "ref", col: columnIndex(ref[2]), row: Number(ref[4]) - 1, absCol: ref[1] === "$", absRow: ref[3] === "$", text: ref[0] },
        start,
      );
      continue;
    }
    const previousColon = tokens.length > 0 && tokens[tokens.length - 1].t === ":" && tokens[tokens.length - 2]?.t === "colref";
    const colref = COLREF.exec(rest) ?? (previousColon ? COLREF_END.exec(rest) : null);
    if (colref) {
      i += colref[0].length;
      push({ t: "colref", col: columnIndex(colref[2]), absCol: colref[1] === "$", text: colref[0] }, start);
      continue;
    }
    if (/[A-Za-z_가-힣]/.test(ch)) {
      const match = /^[A-Za-z_가-힣][A-Za-z0-9_.가-힣]*/.exec(rest)!;
      i += match[0].length;
      const upper = match[0].toUpperCase();
      if (upper === "TRUE" || upper === "FALSE") push({ t: "bool", v: upper === "TRUE" }, start);
      else push({ t: "name", v: upper }, start);
      continue;
    }
    const two = source.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") {
      i += 2;
      push({ t: "op", v: two }, start);
      continue;
    }
    if ("+-*/^&=<>%".includes(ch)) {
      i++;
      push({ t: "op", v: ch }, start);
      continue;
    }
    if (ch === "(" || ch === ")" || ch === "," || ch === ":" || ch === ";") {
      i++;
      push({ t: ch === ";" ? "," : ch } as Token, start);
      continue;
    }
    throw new SyntaxError(`unexpected ${ch}`);
  }
  return { tokens, spans };
}

// --- parser ---

export type Node =
  | { k: "lit"; v: Scalar }
  | { k: "ref"; col: number; row: number }
  | { k: "range"; c1: number; r1: number; c2: number; r2: number }
  | { k: "cols"; c1: number; c2: number }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; name: string; args: Node[] };

const PRECEDENCE: Record<string, number> = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "&": 2, "+": 3, "-": 3, "*": 4, "/": 4, "^": 5 };

export function parse(source: string): Node {
  const { tokens } = tokenize(source);
  let at = 0;
  const peek = () => tokens[at];
  const next = () => tokens[at++];

  function primary(): Node {
    const token = next();
    if (!token) throw new SyntaxError("end");
    switch (token.t) {
      case "num":
        return { k: "lit", v: token.v };
      case "str":
        return { k: "lit", v: token.v };
      case "bool":
        return { k: "lit", v: token.v };
      case "err":
        return { k: "lit", v: err(token.v) };
      case "ref": {
        if (peek()?.t === ":") {
          next();
          const end = next();
          if (end?.t !== "ref") throw new SyntaxError("range");
          return { k: "range", c1: Math.min(token.col, end.col), r1: Math.min(token.row, end.row), c2: Math.max(token.col, end.col), r2: Math.max(token.row, end.row) };
        }
        return { k: "ref", col: token.col, row: token.row };
      }
      case "colref": {
        if (next()?.t !== ":") throw new SyntaxError("column range");
        const end = next();
        if (end?.t !== "colref") throw new SyntaxError("column range");
        return { k: "cols", c1: Math.min(token.col, end.col), c2: Math.max(token.col, end.col) };
      }
      case "name": {
        if (peek()?.t !== "(") return { k: "lit", v: err("#NAME?") };
        next();
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          for (;;) {
            if (peek()?.t === "," || peek()?.t === ")") args.push({ k: "lit", v: null });
            else args.push(expression(0));
            if (peek()?.t === ",") {
              next();
              continue;
            }
            break;
          }
        }
        if (next()?.t !== ")") throw new SyntaxError(")");
        return { k: "call", name: token.v, args };
      }
      case "(": {
        const inner = expression(0);
        if (next()?.t !== ")") throw new SyntaxError(")");
        return inner;
      }
      case "op":
        if (token.v === "-" || token.v === "+") return { k: "un", op: token.v, a: expression(6) };
        throw new SyntaxError(token.v);
      default:
        throw new SyntaxError(token.t);
    }
  }

  function postfix(): Node {
    let node = primary();
    while (peek()?.t === "op" && (peek() as { v: string }).v === "%") {
      next();
      node = { k: "un", op: "%", a: node };
    }
    return node;
  }

  function expression(min: number): Node {
    let left = postfix();
    for (;;) {
      const token = peek();
      if (token?.t !== "op") break;
      const precedence = PRECEDENCE[token.v];
      if (precedence === undefined || precedence < min) break;
      next();
      // ^ is right associative; the others are left associative.
      const right = expression(token.v === "^" ? precedence : precedence + 1);
      left = { k: "bin", op: token.v, a: left, b: right };
    }
    return left;
  }

  const root = expression(0);
  if (at < tokens.length) throw new SyntaxError("trailing");
  return root;
}

// --- evaluation ---

export type Resolver = {
  /**
   * Value of a zero-based cell. `inRange` is true for a cell read as part of a range, so a total
   * under its own column (=SUM(H:H) in H41) can skip itself instead of being circular.
   */
  cell: (col: number, row: number, inRange?: boolean) => Scalar;
  rowCount: number;
  colCount: number;
};

export function evaluate(source: string, resolver: Resolver): Scalar {
  let node: Node;
  try {
    node = parse(source);
  } catch {
    return err("#ERROR!");
  }
  try {
    const value = run(node, resolver);
    if (Array.isArray(value)) return value[0]?.[0] ?? null;
    return value;
  } catch (thrown) {
    if (isError(thrown)) return thrown;
    return err("#ERROR!");
  }
}

function grid(resolver: Resolver, c1: number, r1: number, c2: number, r2: number): Scalar[][] {
  const out: Scalar[][] = [];
  for (let r = r1; r <= Math.min(r2, resolver.rowCount - 1); r++) {
    const line: Scalar[] = [];
    for (let c = c1; c <= Math.min(c2, resolver.colCount - 1); c++) line.push(resolver.cell(c, r, true));
    out.push(line);
  }
  return out;
}

function run(node: Node, resolver: Resolver): Value {
  switch (node.k) {
    case "lit":
      return node.v;
    case "ref":
      if (node.col >= resolver.colCount || node.row >= resolver.rowCount) return err("#REF!");
      return resolver.cell(node.col, node.row);
    case "range":
      return grid(resolver, node.c1, node.r1, node.c2, node.r2);
    case "cols":
      return grid(resolver, node.c1, 0, node.c2, resolver.rowCount - 1);
    case "un": {
      const a = scalar(run(node.a, resolver));
      if (isError(a)) return a;
      const n = toNumber(a);
      if (isError(n)) return n;
      if (node.op === "-") return -n;
      if (node.op === "%") return n / 100;
      return n;
    }
    case "bin":
      return binary(node.op, scalar(run(node.a, resolver)), scalar(run(node.b, resolver)));
    case "call": {
      const fn = FUNCTIONS[node.name];
      if (!fn) return err("#NAME?");
      return fn(node.args, resolver);
    }
  }
}

function scalar(value: Value): Scalar {
  return Array.isArray(value) ? (value[0]?.[0] ?? null) : value;
}

export function toNumber(value: Scalar): number | ErrorValue {
  if (isError(value)) return value;
  if (value === null || value === "") return 0;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = parseNumber(value);
  return n === null ? err("#VALUE!") : n;
}

/** "1,200", "12 명", "30%" → number; anything else is null. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const percent = /^(-?[0-9]*\.?[0-9]+)\s*%$/.exec(trimmed);
  if (percent) return Number(percent[1]) / 100;
  const plain = /^(-?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)(?:\s*[A-Za-z가-힣원명개회%]+)?$/.exec(trimmed);
  return plain ? Number(plain[1]) : null;
}

export function toText(value: Scalar): string {
  if (value === null) return "";
  if (isError(value)) return value.error;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return formatNumber(value);
  return value;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "#NUM!";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1e10) / 1e10);
}

function compare(a: Scalar, b: Scalar): number {
  const an = typeof a === "number" ? a : null;
  const bn = typeof b === "number" ? b : null;
  if (an !== null && bn !== null) return an - bn;
  if (a === null && bn !== null) return -bn;
  if (b === null && an !== null) return an;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  // Text vs number: numbers sort before text, as in Sheets.
  if (an !== null) return -1;
  if (bn !== null) return 1;
  return toText(a).toLowerCase().localeCompare(toText(b).toLowerCase(), "ko");
}

function binary(op: string, a: Scalar, b: Scalar): Scalar {
  if (isError(a)) return a;
  if (isError(b)) return b;
  if (op === "&") return toText(a) + toText(b);
  if (["=", "<>", "<", ">", "<=", ">="].includes(op)) {
    const c = compare(a, b);
    return { "=": c === 0, "<>": c !== 0, "<": c < 0, ">": c > 0, "<=": c <= 0, ">=": c >= 0 }[op]!;
  }
  const x = toNumber(a);
  const y = toNumber(b);
  if (isError(x)) return x;
  if (isError(y)) return y;
  switch (op) {
    case "+":
      return x + y;
    case "-":
      return x - y;
    case "*":
      return x * y;
    case "/":
      return y === 0 ? err("#DIV/0!") : x / y;
    case "^":
      return Math.pow(x, y);
  }
  return err("#ERROR!");
}

// --- functions ---

type Fn = (args: Node[], resolver: Resolver) => Value;

/** Every scalar of the arguments, ranges flattened. */
function flat(args: Node[], resolver: Resolver): { value: Scalar; fromRange: boolean }[] {
  const out: { value: Scalar; fromRange: boolean }[] = [];
  for (const arg of args) {
    const value = run(arg, resolver);
    if (Array.isArray(value)) for (const line of value) for (const item of line) out.push({ value: item, fromRange: true });
    else out.push({ value, fromRange: false });
  }
  return out;
}

/** Numbers of the arguments: ranges skip text and blanks, direct arguments are converted. */
function numbers(args: Node[], resolver: Resolver): number[] | ErrorValue {
  const out: number[] = [];
  for (const { value, fromRange } of flat(args, resolver)) {
    if (isError(value)) return value;
    if (fromRange) {
      // As in Sheets, a range adds up numbers only; text such as "35명" is skipped.
      if (typeof value === "number") out.push(value);
      continue;
    }
    const n = toNumber(value);
    if (isError(n)) return n;
    out.push(n);
  }
  return out;
}

function range(arg: Node | undefined, resolver: Resolver): Scalar[][] {
  if (!arg) return [];
  const value = run(arg, resolver);
  return Array.isArray(value) ? value : [[value]];
}

function arg(args: Node[], index: number, resolver: Resolver): Scalar {
  const node = args[index];
  return node ? scalar(run(node, resolver)) : null;
}

function truthy(value: Scalar): boolean | ErrorValue {
  if (isError(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === null || value === "") return false;
  const upper = value.toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  return err("#VALUE!");
}

/** COUNTIF-style criterion: 5, ">=10", "<>남", "김*", "=". */
export function criterion(raw: Scalar): (value: Scalar) => boolean {
  if (typeof raw === "number" || typeof raw === "boolean") return (value) => compareLoose(value, raw) === 0;
  const text = toText(raw);
  const match = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(text)!;
  const op = match[1] ?? "";
  const operand = match[2];
  const n = parseNumber(operand);
  if (op === "" || op === "=" || op === "<>") {
    let test: (value: Scalar) => boolean;
    if (operand === "") test = (value) => value === null || value === "";
    else if (n !== null) test = (value) => compareLoose(value, n) === 0;
    else if (/[*?]/.test(operand)) {
      const pattern = new RegExp(`^${operand.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "is");
      test = (value) => pattern.test(toText(value));
    } else test = (value) => toText(value).toLowerCase() === operand.toLowerCase();
    return op === "<>" ? (value) => !test(value) : test;
  }
  return (value) => {
    if (n === null) {
      const c = toText(value).toLowerCase().localeCompare(operand.toLowerCase(), "ko");
      return { "<": c < 0, ">": c > 0, "<=": c <= 0, ">=": c >= 0 }[op]!;
    }
    const v = typeof value === "number" ? value : typeof value === "string" ? parseNumber(value) : null;
    if (v === null) return false;
    return { "<": v < n, ">": v > n, "<=": v <= n, ">=": v >= n }[op]!;
  };
}

function compareLoose(value: Scalar, target: number | boolean): number {
  if (typeof target === "boolean") return value === target ? 0 : 1;
  const v = typeof value === "number" ? value : typeof value === "string" ? parseNumber(value) : null;
  return v === null ? 1 : v - target;
}

function ifs(args: Node[], resolver: Resolver, offset: number): boolean[][] | ErrorValue {
  // (range1, criterion1, range2, criterion2, …) starting at offset.
  let mask: boolean[][] | null = null;
  for (let i = offset; i + 1 < args.length; i += 2) {
    const cells = range(args[i], resolver);
    const test = criterion(arg(args, i + 1, resolver));
    const current = cells.map((line) => line.map(test));
    if (mask && (mask.length !== current.length || mask[0]?.length !== current[0]?.length)) return err("#VALUE!");
    mask = mask ? mask.map((line, r) => line.map((on, c) => on && current[r][c])) : current;
  }
  return mask ?? [];
}

function sumWhere(values: Scalar[][], mask: boolean[][]): number[] {
  const out: number[] = [];
  mask.forEach((line, r) =>
    line.forEach((on, c) => {
      if (!on) return;
      const value = values[r]?.[c] ?? null;
      if (typeof value === "number") out.push(value);
    }),
  );
  return out;
}

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
const textFn = (fn: (text: string, args: Node[], resolver: Resolver) => Scalar): Fn => (args, resolver) => {
  const value = arg(args, 0, resolver);
  if (isError(value)) return value;
  return fn(toText(value), args, resolver);
};
const numberArg = (args: Node[], index: number, resolver: Resolver, fallback?: number): number => {
  if (args[index] === undefined && fallback !== undefined) return fallback;
  const n = toNumber(arg(args, index, resolver));
  if (isError(n)) throw n;
  return n;
};
const numericFn = (fn: (list: number[]) => Scalar): Fn => (args, resolver) => {
  const list = numbers(args, resolver);
  return isError(list) ? list : fn(list);
};

export const FUNCTIONS: Record<string, Fn> = {
  SUM: numericFn(sum),
  AVERAGE: numericFn((list) => (list.length === 0 ? err("#DIV/0!") : sum(list) / list.length)),
  MIN: numericFn((list) => (list.length === 0 ? 0 : Math.min(...list))),
  MAX: numericFn((list) => (list.length === 0 ? 0 : Math.max(...list))),
  PRODUCT: numericFn((list) => list.reduce((a, b) => a * b, 1)),
  MEDIAN: numericFn((list) => {
    if (list.length === 0) return err("#NUM!");
    const sorted = [...list].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }),
  COUNT: (args, resolver) => flat(args, resolver).filter(({ value }) => typeof value === "number").length,
  COUNTA: (args, resolver) => flat(args, resolver).filter(({ value }) => value !== null && value !== "").length,
  COUNTBLANK: (args, resolver) => flat(args, resolver).filter(({ value }) => value === null || value === "").length,
  COUNTIF: (args, resolver) => {
    const test = criterion(arg(args, 1, resolver));
    return range(args[0], resolver).flat().filter(test).length;
  },
  COUNTIFS: (args, resolver) => {
    const mask = ifs(args, resolver, 0);
    return isError(mask) ? mask : mask.flat().filter(Boolean).length;
  },
  SUMIF: (args, resolver) => {
    const cells = range(args[0], resolver);
    const test = criterion(arg(args, 1, resolver));
    const values = args[2] ? range(args[2], resolver) : cells;
    return sum(sumWhere(values, cells.map((line) => line.map(test))));
  },
  SUMIFS: (args, resolver) => {
    const mask = ifs(args, resolver, 1);
    return isError(mask) ? mask : sum(sumWhere(range(args[0], resolver), mask));
  },
  AVERAGEIF: (args, resolver) => {
    const cells = range(args[0], resolver);
    const test = criterion(arg(args, 1, resolver));
    const list = sumWhere(args[2] ? range(args[2], resolver) : cells, cells.map((line) => line.map(test)));
    return list.length === 0 ? err("#DIV/0!") : sum(list) / list.length;
  },
  IF: (args, resolver) => {
    const test = truthy(arg(args, 0, resolver));
    if (isError(test)) return test;
    if (test) return args[1] ? scalar(run(args[1], resolver)) : true;
    return args[2] ? scalar(run(args[2], resolver)) : false;
  },
  IFS: (args, resolver) => {
    for (let i = 0; i + 1 < args.length; i += 2) {
      const test = truthy(arg(args, i, resolver));
      if (isError(test)) return test;
      if (test) return arg(args, i + 1, resolver);
    }
    return err("#N/A");
  },
  IFERROR: (args, resolver) => {
    const value = arg(args, 0, resolver);
    return isError(value) ? arg(args, 1, resolver) : value;
  },
  AND: (args, resolver) => {
    for (const { value } of flat(args, resolver)) {
      const test = truthy(value);
      if (isError(test)) return test;
      if (!test) return false;
    }
    return true;
  },
  OR: (args, resolver) => {
    for (const { value } of flat(args, resolver)) {
      const test = truthy(value);
      if (isError(test)) return test;
      if (test) return true;
    }
    return false;
  },
  NOT: (args, resolver) => {
    const test = truthy(arg(args, 0, resolver));
    return isError(test) ? test : !test;
  },
  CONCAT: (args, resolver) => flat(args, resolver).map(({ value }) => toText(value)).join(""),
  CONCATENATE: (args, resolver) => flat(args, resolver).map(({ value }) => toText(value)).join(""),
  TEXTJOIN: (args, resolver) => {
    const separator = toText(arg(args, 0, resolver));
    const skip = truthy(arg(args, 1, resolver)) === true;
    return flat(args.slice(2), resolver)
      .map(({ value }) => toText(value))
      .filter((text) => !skip || text !== "")
      .join(separator);
  },
  LEN: textFn((text) => [...text].length),
  UPPER: textFn((text) => text.toUpperCase()),
  LOWER: textFn((text) => text.toLowerCase()),
  TRIM: textFn((text) => text.trim().replace(/\s+/g, " ")),
  LEFT: textFn((text, args, resolver) => [...text].slice(0, numberArg(args, 1, resolver, 1)).join("")),
  RIGHT: textFn((text, args, resolver) => {
    const n = numberArg(args, 1, resolver, 1);
    return n <= 0 ? "" : [...text].slice(-n).join("");
  }),
  MID: textFn((text, args, resolver) => {
    const start = numberArg(args, 1, resolver);
    const length = numberArg(args, 2, resolver);
    return [...text].slice(start - 1, start - 1 + length).join("");
  }),
  SUBSTITUTE: textFn((text, args, resolver) => {
    const from = toText(arg(args, 1, resolver));
    const to = toText(arg(args, 2, resolver));
    return from ? text.split(from).join(to) : text;
  }),
  VALUE: textFn((text) => parseNumber(text) ?? err("#VALUE!")),
  TEXT: (args, resolver) => {
    const value = arg(args, 0, resolver);
    if (isError(value)) return value;
    const format = toText(arg(args, 1, resolver));
    const n = toNumber(value);
    if (isError(n)) return toText(value);
    const decimals = /\.(0+)/.exec(format)?.[1].length ?? 0;
    const grouped = format.includes(",");
    const text = n.toLocaleString("ko-KR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
    return format.includes("%") ? `${(n * 100).toFixed(decimals)}%` : text;
  },
  ROUND: (args, resolver) => {
    const factor = 10 ** numberArg(args, 1, resolver, 0);
    return Math.round(numberArg(args, 0, resolver) * factor) / factor;
  },
  ROUNDUP: (args, resolver) => {
    const factor = 10 ** numberArg(args, 1, resolver, 0);
    const n = numberArg(args, 0, resolver);
    return (Math.sign(n) * Math.ceil(Math.abs(n) * factor)) / factor;
  },
  ROUNDDOWN: (args, resolver) => {
    const factor = 10 ** numberArg(args, 1, resolver, 0);
    const n = numberArg(args, 0, resolver);
    return (Math.sign(n) * Math.floor(Math.abs(n) * factor)) / factor;
  },
  INT: (args, resolver) => Math.floor(numberArg(args, 0, resolver)),
  ABS: (args, resolver) => Math.abs(numberArg(args, 0, resolver)),
  MOD: (args, resolver) => {
    const d = numberArg(args, 1, resolver);
    if (d === 0) return err("#DIV/0!");
    const n = numberArg(args, 0, resolver);
    return n - d * Math.floor(n / d);
  },
  POWER: (args, resolver) => Math.pow(numberArg(args, 0, resolver), numberArg(args, 1, resolver)),
  SQRT: (args, resolver) => {
    const n = numberArg(args, 0, resolver);
    return n < 0 ? err("#NUM!") : Math.sqrt(n);
  },
  ISBLANK: (args, resolver) => {
    const value = arg(args, 0, resolver);
    return value === null || value === "";
  },
  ISNUMBER: (args, resolver) => typeof arg(args, 0, resolver) === "number",
  ISTEXT: (args, resolver) => typeof arg(args, 0, resolver) === "string",
  ISERROR: (args, resolver) => isError(arg(args, 0, resolver)),
  TODAY: () => new Date().toISOString().slice(0, 10),
  NOW: () => new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
  ROWS: (args, resolver) => range(args[0], resolver).length,
  COLUMNS: (args, resolver) => range(args[0], resolver)[0]?.length ?? 0,
  VLOOKUP: (args, resolver) => {
    const key = arg(args, 0, resolver);
    const table = range(args[1], resolver);
    const index = numberArg(args, 2, resolver);
    if (index < 1 || index > (table[0]?.length ?? 0)) return err("#REF!");
    const line = table.find((cells) => compare(cells[0] ?? null, key) === 0);
    return line ? (line[index - 1] ?? null) : err("#N/A");
  },
  MATCH: (args, resolver) => {
    const key = arg(args, 0, resolver);
    const list = range(args[1], resolver).flat();
    const at = list.findIndex((value) => compare(value, key) === 0);
    return at < 0 ? err("#N/A") : at + 1;
  },
  INDEX: (args, resolver) => {
    const table = range(args[0], resolver);
    const r = numberArg(args, 1, resolver, 1);
    const c = numberArg(args, 2, resolver, 1);
    const line = table.length === 1 && args[2] === undefined ? table[0] : table[r - 1];
    const value = table.length === 1 && args[2] === undefined ? line?.[r - 1] : line?.[c - 1];
    return value === undefined ? err("#REF!") : value;
  },
  XLOOKUP: (args, resolver) => {
    const key = arg(args, 0, resolver);
    const look = range(args[1], resolver).flat();
    const back = range(args[2], resolver).flat();
    const at = look.findIndex((value) => compare(value, key) === 0);
    if (at < 0) return args[3] ? arg(args, 3, resolver) : err("#N/A");
    return back[at] ?? null;
  },
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS).sort();

// --- reference rewriting ---

/**
 * Rewrites every reference of `source` (the text after "=") with `map`. Used to move a formula with
 * the fill handle and to turn A1 text into stored ids and back. `map` returns the new text of a
 * reference, or null for #REF!.
 */
export function rewriteRefs(
  source: string,
  map: (ref: { col: number; row: number | null; absCol: boolean; absRow: boolean }) => string | null,
): string {
  let tokens: Token[];
  let spans: [number, number][];
  try {
    ({ tokens, spans } = tokenize(source));
  } catch {
    return source;
  }
  let out = "";
  let last = 0;
  tokens.forEach((token, index) => {
    if (token.t !== "ref" && token.t !== "colref") return;
    const [start, end] = spans[index];
    const replaced =
      token.t === "ref"
        ? map({ col: token.col, row: token.row, absCol: token.absCol, absRow: token.absRow })
        : map({ col: token.col, row: null, absCol: token.absCol, absRow: false });
    out += source.slice(last, start) + (replaced ?? "#REF!");
    last = end;
  });
  return out + source.slice(last);
}

/** The formula moved by (dCol, dRow): relative references follow, $ references stay. */
export function shiftFormula(formula: string, dCol: number, dRow: number): string {
  if (!formula.startsWith("=")) return formula;
  return (
    "=" +
    rewriteRefs(formula.slice(1), ({ col, row, absCol, absRow }) => {
      const c = absCol ? col : col + dCol;
      if (c < 0) return null;
      if (row === null) return `${absCol ? "$" : ""}${columnLetter(c)}`;
      const r = absRow ? row : row + dRow;
      if (r < 0) return null;
      return `${absCol ? "$" : ""}${columnLetter(c)}${absRow ? "$" : ""}${r + 1}`;
    })
  );
}
