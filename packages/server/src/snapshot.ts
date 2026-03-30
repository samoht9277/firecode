import type { Page, Locator } from "playwright";
import type { RefMap } from "./types.js";

const INTERACTIVE_ROLES = new Set([
  "link", "button", "textbox", "checkbox", "radio",
  "combobox", "slider", "switch", "tab", "menuitem",
  "option", "searchbox", "spinbutton", "heading",
]);

interface SnapshotOptions {
  interactiveOnly?: boolean;
}

export async function getSnapshot(
  page: Page,
  options: SnapshotOptions = {},
): Promise<{ snapshot: string; refMap: RefMap }> {
  const raw = await page.locator("body").ariaSnapshot({ timeout: 10000 });

  let refCounter = 0;
  const refs = new Map<string, { role: string; name: string; nth?: number }>();
  const unnamedCounts = new Map<string, number>();

  const lines = raw.split("\n");
  const tagged: string[] = [];

  for (const line of lines) {
    let isInteractive = false;
    let outputLine = line;

    const namedMatch = line.match(/^(\s*- )(\w+)\s+"([^"]*)"(.*)$/);
    if (namedMatch) {
      const [, indent, role, name, rest] = namedMatch;
      if (INTERACTIVE_ROLES.has(role) || name) {
        refCounter++;
        const refId = `e${refCounter}`;
        refs.set(refId, { role, name });
        outputLine = `${indent}${role} "${name}" [ref=${refId}]${rest}`;
        isInteractive = INTERACTIVE_ROLES.has(role);
      }
    } else {
      const unnamedMatch = line.match(/^(\s*- )(\w+)(:|$)/);
      if (unnamedMatch) {
        const [, indent, role, suffix] = unnamedMatch;
        if (INTERACTIVE_ROLES.has(role)) {
          refCounter++;
          const refId = `e${refCounter}`;
          const nth = (unnamedCounts.get(role) ?? 0);
          unnamedCounts.set(role, nth + 1);
          refs.set(refId, { role, name: "", nth });
          outputLine = `${indent}${role} [ref=${refId}]${suffix}`;
          isInteractive = true;
        }
      }
    }

    if (options.interactiveOnly) {
      if (isInteractive) tagged.push(outputLine);
    } else {
      tagged.push(outputLine);
    }
  }

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

  if (entry.name) {
    return page.getByRole(entry.role as any, { name: entry.name });
  }
  return page.getByRole(entry.role as any).nth(entry.nth ?? 0);
}
