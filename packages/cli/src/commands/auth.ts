import { execFile } from "node:child_process";
import { readdir, copyFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir, tmpdir, platform } from "node:os";
import { FirecodeClient } from "../client.js";

const exec = promisify(execFile);

interface FirefoxCookie {
  name: string;
  value: string;
  host: string;
  path: string;
  expiry: number;
  isSecure: number;
  isHttpOnly: number;
  sameSite: number;
}

function getFirefoxProfilesDir(): string {
  switch (platform()) {
    case "darwin":
      return join(homedir(), "Library/Application Support/Firefox/Profiles");
    case "linux":
      return join(homedir(), ".mozilla/firefox");
    case "win32":
      return join(process.env.APPDATA ?? "", "Mozilla/Firefox/Profiles");
    default:
      throw new Error(`Unsupported platform: ${platform()}`);
  }
}

async function findDefaultProfile(): Promise<string> {
  const profilesDir = getFirefoxProfilesDir();
  if (!existsSync(profilesDir)) {
    throw new Error(
      `Firefox profiles directory not found: ${profilesDir}\nIs Firefox installed?`,
    );
  }
  const entries = await readdir(profilesDir);
  const release = entries.find((e) => e.endsWith(".default-release"));
  if (release) return join(profilesDir, release);
  const def = entries.find((e) => e.endsWith(".default"));
  if (def) return join(profilesDir, def);
  throw new Error(
    `No default Firefox profile found in ${profilesDir}. Have you run Firefox at least once?`,
  );
}

async function readCookies(
  profilePath: string,
  domain: string,
): Promise<FirefoxCookie[]> {
  const dbPath = join(profilePath, "cookies.sqlite");
  if (!existsSync(dbPath)) {
    throw new Error(`Firefox cookies database not found at ${dbPath}`);
  }

  // Copy DB to /tmp because Firefox holds a lock on the original
  const tmpDb = join(tmpdir(), `firecode-cookies-${Date.now()}.sqlite`);
  await copyFile(dbPath, tmpDb);

  try {
    const safeDomain = domain.replace(/'/g, "''");
    const query = `SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies WHERE host = '${safeDomain}' OR host = '.${safeDomain}' OR host LIKE '%.${safeDomain}'`;
    const { stdout } = await exec("sqlite3", ["-json", tmpDb, query]);
    if (!stdout.trim()) return [];
    return JSON.parse(stdout);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(
        "sqlite3 CLI not found. Install it with: brew install sqlite",
      );
    }
    throw err;
  } finally {
    await rm(tmpDb).catch(() => {});
  }
}

function mapSameSite(n: number): "Strict" | "Lax" | "None" {
  if (n === 1) return "Lax";
  if (n === 2) return "Strict";
  return "None";
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function authCommand(
  pageName: string,
  domain: string,
  options: { yes?: boolean },
): Promise<void> {
  try {
    console.log("Finding Firefox profile...");
    const profilePath = await findDefaultProfile();
    console.log(`Reading cookies from ${profilePath}/cookies.sqlite`);
    const rawCookies = await readCookies(profilePath, domain);

    if (rawCookies.length === 0) {
      console.log(`No cookies found for "${domain}".`);
      return;
    }

    const names = rawCookies
      .slice(0, 5)
      .map((c) => c.name)
      .join(", ");
    const more =
      rawCookies.length > 5 ? `, +${rawCookies.length - 5} more` : "";
    console.log(`\nFound ${rawCookies.length} cookies for "${domain}":`);
    console.log(`  ${names}${more}`);

    if (!options.yes) {
      const answer = await prompt(
        `\nImport these cookies into firecode? (y/N) `,
      );
      if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
        console.log("Cancelled.");
        return;
      }
    }

    const cookies = rawCookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.host,
      path: c.path,
      expires: c.expiry > 0 ? c.expiry : -1,
      httpOnly: !!c.isHttpOnly,
      secure: !!c.isSecure,
      sameSite: mapSameSite(c.sameSite || 0),
    }));

    const client = await FirecodeClient.connect();
    await client.post("/pages", { name: pageName });
    const result = await client.post(`/pages/${pageName}/cookies`, {
      cookies,
    });
    console.log(result.message);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
