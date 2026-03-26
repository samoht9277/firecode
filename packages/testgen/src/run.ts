import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface TestResult {
  passed: boolean;
  output: string;
  exitCode: number;
}

export async function runTests(
  testDir: string,
  cleanup: boolean = true,
): Promise<TestResult> {
  try {
    const { stdout, stderr } = await exec(
      "npx",
      [
        "playwright",
        "test",
        "--project=firefox",
        "--reporter=line",
        testDir,
      ],
      {
        cwd: process.cwd(),
        timeout: 120000,
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH:
            process.env.PLAYWRIGHT_BROWSERS_PATH ?? undefined,
        },
      },
    );

    if (cleanup) await rm(testDir, { recursive: true, force: true });

    return {
      passed: true,
      output: stdout + stderr,
      exitCode: 0,
    };
  } catch (err: any) {
    if (cleanup) await rm(testDir, { recursive: true, force: true });

    return {
      passed: false,
      output: (err.stdout ?? "") + (err.stderr ?? ""),
      exitCode: err.code ?? 1,
    };
  }
}
