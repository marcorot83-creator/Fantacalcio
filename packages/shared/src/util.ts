export function normalizeName(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function playerStableId(nome: string, squadra: string): string {
  return `${normalizeName(nome)}|${normalizeName(squadra || "")}`;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

export interface FuzzyMatch<T> {
  item: T;
  score: number; // 0..1, 1 = exact
}

/**
 * Fuzzy-match a free-text query against a list of candidates.
 * Returns matches sorted best-first; caller decides how to handle ambiguity
 * (never silently pick a guess when multiple plausible matches tie).
 */
export function fuzzyFind<T>(
  query: string,
  candidates: T[],
  getLabel: (item: T) => string
): FuzzyMatch<T>[] {
  const q = normalizeName(query);
  if (!q) return [];
  const results: FuzzyMatch<T>[] = candidates.map((item) => {
    const label = normalizeName(getLabel(item));
    let score: number;
    if (label === q) score = 1;
    else if (label.startsWith(q) || q.startsWith(label)) score = 0.92;
    else if (label.includes(q) || q.includes(label)) score = 0.85;
    else {
      const dist = levenshtein(q, label);
      const maxLen = Math.max(q.length, label.length, 1);
      score = Math.max(0, 1 - dist / maxLen);
    }
    return { item, score };
  });
  return results.sort((a, b) => b.score - a.score);
}

export function uid(prefix = ""): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
