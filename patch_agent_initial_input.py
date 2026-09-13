from pathlib import Path

p = Path("lib/agents-handler.mjs")
s = p.read_text(encoding="utf-8")
old = '      environment: { type: "none" },'
new = old + '\n      input: "Session initialized.",'
if new not in s:
    if old not in s:
        raise SystemExit("Agents session environment line not found")
    s = s.replace(old, new, 1)
p.write_text(s, encoding="utf-8")
print("Agents conversation initial input patched")
