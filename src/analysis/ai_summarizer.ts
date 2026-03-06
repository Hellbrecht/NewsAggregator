export interface SummarizeOptions {
  maxSentences?: number;
  maxLength?: number;
}

export function summarizeText(input: string, options: SummarizeOptions = {}): string {
  const maxSentences = Math.max(1, options.maxSentences ?? 2);
  const maxLength = Math.max(80, options.maxLength ?? 280);
  const cleaned = cleanText(input);
  if (!cleaned) {
    return "No summary available.";
  }

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const summary = sentences.slice(0, maxSentences).join(" ");
  if (summary.length <= maxLength) {
    return summary;
  }

  return `${summary.slice(0, maxLength - 1).trim()}…`;
}

export function summarizeArticleCandidate(title: string, body: string): string {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const merged =
    trimmedTitle && trimmedBody ? `${trimmedTitle}. ${trimmedBody}` : trimmedTitle || trimmedBody;
  return summarizeText(merged, { maxSentences: 2, maxLength: 260 });
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
