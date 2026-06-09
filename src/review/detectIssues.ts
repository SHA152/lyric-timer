import type { ReviewProject, WordIssue } from './types';

/**
 * Surface candidate timing problems for human review.
 * Heuristics: keep these tight to avoid spamming the user with false positives
 * that grow when they fix one thing.
 */
export function detectIssues(p: ReviewProject): WordIssue[] {
  const issues: WordIssue[] = [];
  // Only flag duplicates we haven't already flagged at the line level.
  const linesFlaggedCollapsed = new Set<number>();

  p.lines.forEach((line, li) => {
    const wordStarts = line.words.map((w) => w.startSec);
    const wordEnds   = line.words.map((w) => w.endSec);

    // 1. Whole-line collapse: 3+ words all at the same start, span < 0.5s
    if (line.words.length >= 3) {
      const allStartsEqual = wordStarts.every((s) => s === wordStarts[0]);
      const span = Math.max(...wordEnds) - Math.min(...wordStarts);
      if (allStartsEqual && span < 0.5) {
        issues.push({
          lineIndex: li,
          wordIndex: 0,
          kind: 'collapsed-line',
          message: `Line ${li + 1}: "${line.text}" — all ${line.words.length} words at ${wordStarts[0].toFixed(2)}s`,
        });
        linesFlaggedCollapsed.add(li);
        return; // don't double-report words within an already-flagged collapsed line
      }
    }

    // 2. Internal sub-runs of 2+ words with IDENTICAL timing (the "in / skills / in" overlap)
    let k = 0;
    const flagged = new Set<number>();
    while (k < line.words.length) {
      let j = k;
      while (j + 1 < line.words.length
          && line.words[j+1].startSec === line.words[k].startSec
          && line.words[j+1].endSec   === line.words[k].endSec) {
        j += 1;
      }
      const runLen = j - k + 1;
      if (runLen >= 2) {
        const wordsList = line.words.slice(k, j + 1).map((w) => `"${w.text}"`).join(', ');
        issues.push({
          lineIndex: li,
          wordIndex: k,
          kind: 'collapsed-line',
          message: `Line ${li + 1}: ${wordsList} share identical timing (${line.words[k].startSec.toFixed(2)}s)`,
        });
        for (let m = k; m <= j; m++) flagged.add(m);
      }
      k = j + 1;
    }

    // 3. Truly zero-duration words (start == end) NOT already part of a run above
    line.words.forEach((w, wi) => {
      if (flagged.has(wi)) return;
      if (w.endSec - w.startSec < 0.001) {
        issues.push({
          lineIndex: li,
          wordIndex: wi,
          kind: 'zero-duration',
          message: `Line ${li + 1}: "${w.text}" has zero duration at ${w.startSec.toFixed(2)}s`,
        });
      }
    });
  });

  return issues;
}
