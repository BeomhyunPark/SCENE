import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tokensCss = readFileSync(join(root, "src/styles/tokens.css"), "utf8");
const headerCss = readFileSync(join(root, "src/components/PublicHeader.css"), "utf8");
const homeCss = readFileSync(join(root, "src/components/PublicHome.css"), "utf8");
const globalCss = readFileSync(join(root, "src/styles/global.css"), "utf8");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  packageManager: string;
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};

const colorTokens = [
  "bg-canvas",
  "bg-surface",
  "bg-subtle",
  "bg-brand-subtle",
  "bg-raised",
  "bg-hover-row",
  "bg-selected",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "text-disabled",
  "text-brand",
  "text-on-accent",
  "text-on-danger",
  "border-default",
  "border-control",
  "border-strong",
  "border-selected",
  "border-raised",
  "border-hover-row",
  "accent",
  "action-primary-bg",
  "selected-indicator",
  "accent-hover",
  "action-primary-bg-hover",
  "accent-pressed",
  "action-primary-bg-pressed",
  "action-primary-bg-disabled",
  "action-primary-on",
  "action-primary-on-disabled",
  "focus-ring",
  "success-fg",
  "success-bg",
  "warning-fg",
  "warning-bg",
  "danger-fg",
  "danger-bg",
  "info-fg",
  "info-bg",
  "danger-hover",
  "danger-pressed",
  "warning-bg-large",
  "attendance-full",
  "attendance-partial",
  "attendance-partial-tint",
  "attendance-absent",
  "attendance-absent-border",
  "badge-attendance-full-fg",
  "badge-attendance-full-bg",
  "badge-attendance-partial-fg",
  "badge-attendance-partial-bg",
  "badge-over-capacity-fg",
  "badge-over-capacity-bg",
  "badge-new-family-fg",
  "badge-new-family-bg",
  "chip-default-bg",
  "chip-default-border",
  "chip-default-text",
  "chip-hover-bg",
  "chip-hover-border",
  "chip-hover-text",
  "chip-selected-bg",
  "chip-selected-border",
  "chip-selected-text",
  "drag-row-raised-bg",
  "drag-row-raised-border",
  "drag-origin-placeholder-border",
  "drag-origin-placeholder-bg",
  "sticky-unsaved-bg",
  "sticky-unsaved-border",
  "sticky-unsaved-icon",
  "leader-icon",
  "drop-hover-bg",
  "drop-hover-border",
  "drop-rest-border",
  "drop-empty-group-border",
  "drop-empty-group-icon",
  "drop-rest-text",
  "drop-empty-group-text",
  "drop-over-capacity-border",
  "drop-over-capacity-bg",
  "group-over-capacity-border",
  "group-over-capacity-count",
  "overlay-scrim",
  "shadow-raised-sm",
  "shadow-popover",
  "shadow-dialog",
  "shadow-drag-1",
  "shadow-drag-2",
  "shadow-sticky",
  "shadow-color",
];

const sceneStyles = [
  "display",
  "heading-l",
  "heading-m",
  "heading-s",
  "title",
  "body-l",
  "body-l-strong",
  "body-m",
  "body-m-strong",
  "body-s",
  "body-s-strong",
  "label-l",
  "label-m",
  "label-s",
  "caption-m",
  "caption-s",
];

function declarations(block: string): string[] {
  return [...block.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((match) => match[1]);
}

describe("tokens", () => {
  it("puts light values on :root and dark values under the theme selector", () => {
    const darkStart = tokensCss.indexOf('[data-theme="dark"]');
    expect(darkStart).toBeGreaterThan(0);
    const light = tokensCss.slice(0, darkStart);
    const dark = tokensCss.slice(darkStart);

    expect(declarations(light).sort()).toEqual([...colorTokens].sort());
    expect(declarations(dark).sort()).toEqual([...colorTokens].sort());
    expect(colorTokens).toHaveLength(91);

    for (const style of sceneStyles) {
      expect(light).toContain(`--scene-${style}:`);
      expect(dark).not.toContain(`--scene-${style}:`);
      expect(light).toContain(`--scene-${style}:`);
      expect(light).toMatch(new RegExp(`--scene-${style}:[^;]*"Noto Sans KR"`));
    }

    expect(globalCss).toContain("background: var(--color-bg-canvas)");
    expect(globalCss).toContain("word-break: keep-all");
    expect(headerCss).toContain('font-family: "Geist"');
    expect(tokensCss).not.toContain("theme-toggle");
    expect(homeCss).toContain("min-width: 1280px");
    expect(homeCss).toContain("max-width: 390px");
    expect(homeCss).toContain("width: 940px");
    expect(homeCss).toContain("width: calc(100% - 40px)");
    expect(homeCss).toContain("min-height: 48px");
    expect(homeCss).toContain("var(--color-text-primary)");
    expect(homeCss).toContain("var(--color-text-tertiary)");
    expect(homeCss).not.toContain("data-theme");
  });

  it("declares the architecture toolchain without calling the API", () => {
    expect(packageJson.packageManager.startsWith("pnpm@")).toBe(true);
    expect(packageJson.dependencies["@tanstack/react-query"]).toBeTruthy();
    expect(packageJson.dependencies["react-hook-form"]).toBeTruthy();
    expect(packageJson.dependencies.zod).toBeTruthy();
    expect(packageJson.dependencies["react-router"]).toBeTruthy();
    for (const script of ["dev", "build", "lint", "typecheck", "test"]) {
      expect(packageJson.scripts[script]).toBeTruthy();
    }

    const files = sourceFiles(join(root, "src"));
    const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined.includes(["/api", "v1"].join("/"))).toBe(false);
    expect(combined.includes("fetch(")).toBe(false);
    expect(combined.includes("react-hook-form")).toBe(false);
    expect(combined.includes("from \"zod\"")).toBe(false);
    expect(combined.includes("from 'zod'")).toBe(false);
  });
});

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) {
      continue;
    }
    found.push(path);
  }
  return found;
}
