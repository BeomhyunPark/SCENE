#!/usr/bin/env python3
"""SCENE docs checks (NEW script proposed for CI; does not exist in the repo yet).

1. Every docs/**/*.json parses.
2. Any JSON with top-level "passed"/"total" (prototype reaction-check results) has passed == total.
3. Relative links / src / href in all *.md files resolve to an existing file.
Exit code 1 on any failure. Stdlib only.
"""
import glob, json, os, re, sys, urllib.parse

errors = []

for f in sorted(glob.glob("docs/**/*.json", recursive=True)):
    try:
        with open(f, encoding="utf-8") as fh:
            d = json.load(fh)
    except Exception as e:  # noqa: BLE001
        errors.append(f"{f}: invalid JSON ({e})")
        continue
    if isinstance(d, dict) and "passed" in d and "total" in d:
        status = "OK" if d["passed"] == d["total"] else "MISMATCH"
        print(f"{f}: {d['passed']}/{d['total']} {status}")
        if status != "OK":
            errors.append(f"{f}: passed {d['passed']} != total {d['total']}")

LINK = re.compile(r'\]\(([^)\s]+)\)|src="([^"]+)"|href="([^"]+)"')
for f in sorted(glob.glob("**/*.md", recursive=True)):
    if f.startswith(("node_modules/", ".git/")):
        continue
    with open(f, encoding="utf-8") as fh:
        text = fh.read()
    for m in LINK.finditer(text):
        link = next(x for x in m.groups() if x)
        if re.match(r"^(https?:|mailto:|#)", link):
            continue
        path = urllib.parse.unquote(link.split("#")[0])
        if not path:
            continue
        target = os.path.normpath(os.path.join(os.path.dirname(f), path))
        if not os.path.exists(target):
            errors.append(f"{f}: broken relative link -> {link}")

if errors:
    print("\nFAILED:")
    print("\n".join(f"  {e}" for e in errors))
    sys.exit(1)
print("\nAll docs checks passed.")
