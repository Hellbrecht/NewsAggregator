const DEFAULT_GENERATED_TITLE_MAX_LENGTH = 96;

export function resolveArticleTitle(
  originalTitle: string,
  summary: string,
  fallbackTitle: string
): string {
  const normalizedTitle = normalizeWhitespace(originalTitle);
  if (normalizedTitle && !isPlaceholderArticleTitle(normalizedTitle)) {
    return normalizedTitle;
  }

  const generated = generateShortTitleFromSummary(summary);
  if (generated) {
    return generated;
  }

  return normalizedTitle || fallbackTitle;
}

export function isPlaceholderArticleTitle(value: string): boolean {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  return normalized.startsWith("untitled") || normalized.startsWith("sans titre");
}

export function generateShortTitleFromSummary(summary: string): string | null {
  const normalized = normalizeWhitespace(summary).replace(/^[\s\-–—:;,.!?'"()\[\]]+/, "").trim();
  if (!normalized) {
    return null;
  }

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  const withoutTrailingPunctuation = firstSentence.replace(/[.!?]+$/, "").trim();
  if (!withoutTrailingPunctuation) {
    return null;
  }

  if (withoutTrailingPunctuation.length <= DEFAULT_GENERATED_TITLE_MAX_LENGTH) {
    return withoutTrailingPunctuation;
  }

  const hardCut = withoutTrailingPunctuation.slice(0, DEFAULT_GENERATED_TITLE_MAX_LENGTH + 1);
  const softCutIndex = hardCut.lastIndexOf(" ");
  const cutoff =
    softCutIndex >= Math.floor(DEFAULT_GENERATED_TITLE_MAX_LENGTH * 0.6)
      ? hardCut.slice(0, softCutIndex)
      : hardCut.slice(0, DEFAULT_GENERATED_TITLE_MAX_LENGTH);

  return `${cutoff.trim()}...`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
