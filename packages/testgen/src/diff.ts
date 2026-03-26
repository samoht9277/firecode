import simpleGit from "simple-git";

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  diff: string;
}

export interface DiffResult {
  files: DiffFile[];
  raw: string;
}

export async function parseDiff(
  target: "unstaged" | "branch" | "changes" = "changes",
  cwd?: string,
): Promise<DiffResult> {
  const git = simpleGit(cwd);

  let diffArgs: string[];
  switch (target) {
    case "unstaged":
      diffArgs = [];
      break;
    case "branch":
      diffArgs = ["main...HEAD"];
      break;
    case "changes":
      diffArgs = ["HEAD"];
      break;
  }

  const raw = await git.diff(diffArgs);
  const nameStatus = await git.diff([...diffArgs, "--name-status"]);

  const files: DiffFile[] = [];
  for (const line of nameStatus.split("\n").filter(Boolean)) {
    const [statusChar, ...pathParts] = line.split("\t");
    const path = pathParts.join("\t");
    if (!path) continue;

    let status: DiffFile["status"];
    switch (statusChar?.[0]) {
      case "A":
        status = "added";
        break;
      case "D":
        status = "deleted";
        break;
      case "R":
        status = "renamed";
        break;
      default:
        status = "modified";
        break;
    }

    const fileRegex = new RegExp(
      `diff --git a/.*${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*?(?=diff --git|$)`,
      "s",
    );
    const match = raw.match(fileRegex);

    files.push({ path, status, diff: match?.[0] ?? "" });
  }

  return { files, raw };
}
