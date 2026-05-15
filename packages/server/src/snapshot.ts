import { createHash } from "node:crypto";
import type { Page, Locator, FrameLocator } from "playwright";
import type { RefMap } from "./types.js";

const INTERACTIVE_ROLES = new Set([
  "link", "button", "textbox", "checkbox", "radio",
  "combobox", "slider", "switch", "tab", "menuitem",
  "option", "searchbox", "spinbutton", "heading",
]);

interface SnapshotOptions {
  interactiveOnly?: boolean;
  frame?: string;
}

function refIdFor(role: string, name: string, nth: number): string {
  // Stable 4-char hex from the element identity. Same role+name+nth → same ref.
  const hash = createHash("sha1")
    .update(`${role}\0${name}\0${nth}`)
    .digest("hex")
    .slice(0, 4);
  return `e${hash}`;
}

export async function getSnapshot(
  page: Page,
  options: SnapshotOptions = {},
): Promise<{ snapshot: string; refMap: RefMap }> {
  const root = options.frame
    ? page.frameLocator(options.frame).locator("body")
    : page.locator("body");
  const raw = await root.ariaSnapshot({ timeout: 10000 });

  const refs = new Map<string, { role: string; name: string; nth: number }>();
  const occurrences = new Map<string, number>(); // role|name -> count seen so far

  const lines = raw.split("\n");
  const tagged: string[] = [];

  for (const line of lines) {
    let isInteractive = false;
    let outputLine = line;
    let role: string | undefined;
    let name = "";

    const namedMatch = line.match(/^(\s*- )(\w+)\s+"([^"]*)"(.*)$/);
    if (namedMatch) {
      const [, indent, r, n, rest] = namedMatch;
      role = r;
      name = n;
      if (INTERACTIVE_ROLES.has(role) || name) {
        const key = `${role}|${name}`;
        const nth = occurrences.get(key) ?? 0;
        occurrences.set(key, nth + 1);
        const refId = refIdFor(role, name, nth);
        refs.set(refId, { role, name, nth });
        outputLine = `${indent}${role} "${name}" [ref=${refId}]${rest}`;
        isInteractive = INTERACTIVE_ROLES.has(role);
      }
    } else {
      const unnamedMatch = line.match(/^(\s*- )(\w+)(:|$)/);
      if (unnamedMatch) {
        const [, indent, r, suffix] = unnamedMatch;
        role = r;
        if (INTERACTIVE_ROLES.has(role)) {
          const key = `${role}|`;
          const nth = occurrences.get(key) ?? 0;
          occurrences.set(key, nth + 1);
          const refId = refIdFor(role, "", nth);
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
    refMap: { refs, timestamp: Date.now(), frame: options.frame },
  };
}

export function resolveRef(
  page: Page,
  refMap: RefMap,
  refId: string,
  frameOverride?: string,
): Locator {
  if (refMap.timestamp === 0) {
    throw new Error(
      `No snapshot taken yet. Run "firecode snapshot" first to get ref IDs.`
    );
  }

  const age = Date.now() - refMap.timestamp;
  const entry = refMap.refs.get(refId);
  if (!entry) {
    const staleHint = age > 30000
      ? ` Snapshot is ${Math.round(age / 1000)}s old, page may have changed.`
      : "";
    throw new Error(
      `Ref "${refId}" not found. Available refs: ${[...refMap.refs.keys()].slice(0, 20).join(", ")}.${staleHint} Re-run "firecode snapshot" to refresh.`
    );
  }

  const frame = frameOverride ?? refMap.frame;
  const root: Page | FrameLocator = frame ? page.frameLocator(frame) : page;

  if (entry.name) {
    return root.getByRole(entry.role as any, { name: entry.name }).nth(entry.nth ?? 0);
  }
  return root.getByRole(entry.role as any).nth(entry.nth ?? 0);
}
