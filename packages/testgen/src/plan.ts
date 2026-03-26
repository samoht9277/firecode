import type { AnalyzedFile, FileCategory } from "./analyze.js";

export interface TestPlanItem {
  description: string;
  file: string;
  category: FileCategory;
  checks: string[];
}

export interface TestPlan {
  items: TestPlanItem[];
  summary: string;
}

function planForCategory(file: AnalyzedFile): TestPlanItem {
  const checks: string[] = [];

  switch (file.category) {
    case "component":
      checks.push("Page loads without errors");
      checks.push("Component renders visible content");
      checks.push("Interactive elements are clickable");
      break;
    case "page":
      checks.push("Page loads and returns 200");
      checks.push("Page title is set");
      checks.push("Main content area is present");
      checks.push("Navigation works");
      break;
    case "api":
      checks.push("Page consuming this API loads");
      checks.push("Data is displayed after API responds");
      break;
    case "style":
      checks.push("Page loads without layout errors");
      checks.push("Take screenshot for visual verification");
      break;
    default:
      checks.push("Application still loads correctly");
      break;
  }

  return {
    description: `Test ${file.category}: ${file.path}`,
    file: file.path,
    category: file.category,
    checks,
  };
}

export function generatePlan(files: AnalyzedFile[]): TestPlan {
  const testableFiles = files.filter(
    (f) => f.category !== "config" && f.category !== "other",
  );

  const items = testableFiles.map(planForCategory);

  return {
    items,
    summary: `${items.length} test${items.length !== 1 ? "s" : ""} planned for ${testableFiles.length} file${testableFiles.length !== 1 ? "s" : ""}`,
  };
}
