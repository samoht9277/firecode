import type { Page, Locator } from "playwright";
import type { RefMap } from "./types.js";

const INTERACTIVE_ROLES = new Set([
  "link", "button", "textbox", "checkbox", "radio",
  "combobox", "slider", "switch", "tab", "menuitem",
  "option", "searchbox", "spinbutton", "heading",
]);

export async function getSnapshot(page: Page): Promise<{ snapshot: string; refMap: RefMap }> {
  const raw = await page.locator("body").ariaSnapshot({ timeout: 10000 });

  let refCounter = 0;
  const refs = new Map<string, { role: string; name: string }>();

  const lines = raw.split("\n");
  const tagged = lines.map((line) => {
    const match = line.match(/^(\s*- )(\w+)\s+"([^"]*)"(.*)$/);
    if (!match) return line;

    const [, indent, role, name, rest] = match;

    if (INTERACTIVE_ROLES.has(role) || name) {
      refCounter++;
      const refId = `e${refCounter}`;
      refs.set(refId, { role, name });
      return `${indent}${role} "${name}" [ref=${refId}]${rest}`;
    }

    return line;
  });

  return {
    snapshot: tagged.join("\n"),
    refMap: { refs, timestamp: Date.now() },
  };
}

export function resolveRef(
  page: Page,
  refMap: RefMap,
  refId: string
): Locator {
  const entry = refMap.refs.get(refId);
  if (!entry) {
    throw new Error(
      `Ref "${refId}" not found. Available refs: ${[...refMap.refs.keys()].join(", ")}. Re-run "firecode snapshot" to refresh.`
    );
  }

  return page.getByRole(entry.role as any, { name: entry.name });
}
