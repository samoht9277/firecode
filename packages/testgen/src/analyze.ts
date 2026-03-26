import type { DiffFile } from "./diff.js";

export type FileCategory =
  | "component"
  | "page"
  | "api"
  | "style"
  | "config"
  | "other";

export interface AnalyzedFile {
  path: string;
  status: DiffFile["status"];
  category: FileCategory;
  diff: string;
}

export interface AnalysisResult {
  files: AnalyzedFile[];
  summary: string;
}

function categorizeFile(path: string): FileCategory {
  if (/\.(css|scss|sass|less|styl)$/.test(path)) return "style";
  if (/\.(tsx|jsx)$/.test(path)) return "component";
  if (
    /\/(routes|pages|views)\//i.test(path) ||
    /\.(page|route)\.(ts|js|tsx|jsx)$/.test(path)
  )
    return "page";
  if (
    /\/(api|server|handlers|controllers)\//i.test(path) ||
    /\.(api|handler|controller)\.(ts|js)$/.test(path)
  )
    return "api";
  if (
    /\.(json|yaml|yml|toml|env|config)\b/.test(path) ||
    /config/i.test(path)
  )
    return "config";
  return "other";
}

export function analyzeChanges(files: DiffFile[]): AnalysisResult {
  const analyzed: AnalyzedFile[] = files
    .filter((f) => f.status !== "deleted")
    .map((f) => ({
      path: f.path,
      status: f.status,
      category: categorizeFile(f.path),
      diff: f.diff,
    }));

  const counts = new Map<FileCategory, number>();
  for (const f of analyzed) {
    counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const [cat, count] of counts) {
    parts.push(`${count} ${cat} file${count > 1 ? "s" : ""}`);
  }
  const summary = `Changed: ${parts.join(", ")}`;

  return { files: analyzed, summary };
}
