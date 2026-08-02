export interface FuzzyMatch {
  score: number;
  indices: number[];
}

/** Higher score = better match. Null when not every query char appears in `text` in order.
 * Case-insensitive; operates on code points so Chinese matches naturally. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLocaleLowerCase();
  const t = text.toLocaleLowerCase();
  if (!q) return { score: 0, indices: [] };

  let qi = 0;
  let last = -2;
  let score = 0;
  const indices: number[] = [];

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += ti === last + 1 ? 8 : 1; // consecutive runs worth more
      last = ti;
      indices.push(ti);
      qi++;
    }
  }
  if (qi < q.length) return null;

  if (indices[0] === 0) score += 12; // prefix bonus
  for (let i = 1; i < indices.length; i++) {
    score -= (indices[i] - indices[i - 1] - 1) * 2; // gap penalty
  }
  if (t.length === q.length) score += 6; // full-string bonus
  return { score, indices };
}
