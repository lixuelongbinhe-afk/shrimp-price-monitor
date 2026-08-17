import type { ValidatedQuote } from "../domain/models.js";
import { normalizedText, similarity } from "./hash.js";

export function isDuplicate(candidate: ValidatedQuote, existing: readonly ValidatedQuote[]): boolean {
  return existing.some((quote) => {
    if (quote.source.contentHash === candidate.source.contentHash) return true;
    if (normalizedUrl(quote.source.url) === normalizedUrl(candidate.source.url)) return true;
    const samePublisher = Boolean(candidate.source.originalPublisher && quote.source.originalPublisher === candidate.source.originalPublisher);
    const similarTitleAndEvidence = similarity(
      `${quote.source.title} ${quote.evidence}`,
      `${candidate.source.title} ${candidate.evidence}`
    ) >= 0.82;
    return samePublisher && similarTitleAndEvidence;
  });
}

function normalizedUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const name of [...url.searchParams.keys()]) {
      if (/^(utm_|spm|from|source)/i.test(name)) url.searchParams.delete(name);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return normalizedText(value);
  }
}
