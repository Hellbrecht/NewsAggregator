import { readFileSync } from "node:fs";
import path from "node:path";

const DOT_ENV_PATH = path.resolve(__dirname, "../../../.env");
const ASSIGNMENT_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/;

loadDotEnvFile();

function loadDotEnvFile(): void {
  let content: string;
  try {
    content = readFileSync(DOT_ENV_PATH, "utf8");
  } catch {
    return;
  }

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const match = line.match(ASSIGNMENT_PATTERN);
    if (!match) {
      return;
    }

    const key = match[1];
    if (process.env[key] !== undefined) {
      return;
    }

    process.env[key] = parseValue(match[2]);
  });
}

function parseValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }

  const quote = trimmed[0];
  if ((quote === "\"" || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }

  const commentIndex = trimmed.indexOf(" #");
  if (commentIndex >= 0) {
    return trimmed.slice(0, commentIndex).trim();
  }

  return trimmed;
}
