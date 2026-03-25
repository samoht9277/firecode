import type { Page, Locator } from "playwright";
import type { RefMap, SnapshotResult } from "./types.js";

export async function getSnapshot(page: Page): Promise<{ snapshot: string; refMap: RefMap }> {
  const raw = await page.locator("body").ariaSnapshot({ timeout: 10000 });

  let refCounter = 0;
  const refs = new Map<string, { role: string; name: string }>();

  // Parse the ARIA snapshot YAML and add ref tags to interactive/named elements
  // Format: "- role \"name\"" or "- role:" (container)
  const lines = raw.split("\n");
  const tagged = lines.map((line) => {
    // Match lines like: "  - button \"Submit\"" or "  - textbox \"Email\""
    const match = line.match(/^(\s*- )(\w+)\s+"([^"]*)"(.*)$/);
    if (!match) return line;

    const [, indent, role, name, rest] = match;
    const interactiveRoles = [
      "link", "button", "textbox", "checkbox", "radio",
      "combobox", "slider", "switch", "tab", "menuitem",
      "option", "searchbox", "spinbutton", "heading",
    ];

    if (interactiveRoles.includes(role) || name) {
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
