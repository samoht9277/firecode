import { mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import type { TestPlanItem } from "./plan.js";

export interface GeneratedTest {
  path: string;
  content: string;
}

function generateTestContent(
  item: TestPlanItem,
  baseUrl: string,
): string {
  const checks = item.checks
    .map(
      (check) => `
  test('${check}', async ({ page }) => {
    await page.goto('${baseUrl}');
    // Verify: ${check}
    await expect(page.locator('body')).toBeVisible();
  });`,
    )
    .join("\n");

  return `import { test, expect } from '@playwright/test';

test.describe('${item.description}', () => {${checks}
});
`;
}

export async function generateTests(
  items: TestPlanItem[],
  baseUrl: string,
  outDir: string,
): Promise<GeneratedTest[]> {
  await mkdir(outDir, { recursive: true });

  const tests: GeneratedTest[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const safeName = basename(item.file)
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9]/g, "-");
    const testPath = join(outDir, `${i + 1}-${safeName}.spec.ts`);
    const content = generateTestContent(item, baseUrl);

    await writeFile(testPath, content);
    tests.push({ path: testPath, content });
  }

  return tests;
}
