import { parseDiff, analyzeChanges, generatePlan, generateTests, runTests } from "@firecode/testgen";
import { join } from "node:path";
import { createInterface } from "node:readline";

export interface TestOptions {
  target?: "unstaged" | "branch" | "changes";
  baseUrl?: string;
  message?: string;
  yes?: boolean;
}

export async function testCommand(options: TestOptions): Promise<void> {
  const target = options.target ?? "changes";
  const baseUrl = options.baseUrl ?? "http://localhost:3000";

  try {
    console.log(`Parsing git diff (${target})...`);
    const diff = await parseDiff(target);

    if (diff.files.length === 0) {
      console.log("No changes detected.");
      return;
    }

    console.log(`Found ${diff.files.length} changed file(s).`);

    const analysis = analyzeChanges(diff.files);
    console.log(analysis.summary);

    const plan = generatePlan(analysis.files);

    if (plan.items.length === 0) {
      console.log("No testable changes found.");
      return;
    }

    console.log(`\nTest plan (${plan.summary}):`);
    for (const item of plan.items) {
      console.log(`  - ${item.description}`);
      for (const check of item.checks) {
        console.log(`    - ${check}`);
      }
    }

    if (!options.yes) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await new Promise<string>((resolve) => {
        rl.question("\nRun these tests? (y/n) ", resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== "y") {
        console.log("Cancelled.");
        return;
      }
    }

    const testDir = join(process.cwd(), ".firecode", "tests");
    console.log("\nGenerating tests...");
    const tests = await generateTests(plan.items, baseUrl, testDir);
    console.log(`Generated ${tests.length} test file(s).`);

    console.log("Running tests...\n");
    const result = await runTests(testDir);

    console.log(result.output);
    if (result.passed) {
      console.log("All tests passed!");
    } else {
      console.log("Some tests failed.");
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
