import { promises as fs } from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  message: string;
  context?: Record<string, unknown>;
}

const LOG_FILE_PATH = path.resolve(__dirname, "../../data/ingested/pipeline_logs.jsonl");
let appendQueue = Promise.resolve<void>(undefined);

export function logEvent(
  level: LogLevel,
  event: string,
  message: string,
  context?: Record<string, unknown>
): void {
  const payload: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
    context
  };

  const serialized = JSON.stringify(payload);
  queueLogWrite(serialized);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

function queueLogWrite(line: string): void {
  const execute = async (): Promise<void> => {
    try {
      await fs.mkdir(path.dirname(LOG_FILE_PATH), { recursive: true });
      await fs.appendFile(LOG_FILE_PATH, `${line}\n`, "utf8");
    } catch {
      // Log persistence should never break runtime logging behavior.
    }
  };

  appendQueue = appendQueue.then(execute, execute);
  appendQueue = appendQueue.then(
    () => undefined,
    () => undefined
  );
}
