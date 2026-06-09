import type { ReviewProject, WordIssue } from './types';

/**
 * Surface candidate timing problems for human review.
 * Heuristics, not certainty — final call is always the editor's.
 */
export function detectIssues(p: ReviewProject): WordIssue[] {
  const issues: WordIssue[] = [];
  let prevEnd = 0;

  p.lines.forEach((line, li) => {
    const wordStarts = line.words.map((w) => w.startSec);
    const wordEnds   = line.words.map((w) => w.endSec);

    // Whole-line collapse: every word starts at same instant, span < 0.5s
    if (line.words.length >= 3) {
      const allEqual = wordStarts.every((s) => s === wordStarts[0]);
      const span = Math.max(...wordEnds) - Math.min(...wordStarts);
      if (allEqual && span < 0.5) {
        issues.push({
          lineIndex: li,
          wordIndex: 0,
          kind: 'collapsed-line',
          message: `Line ${li}: all ${line.words.length} words collapsed at ${wordStarts[0].toFixed(2)}s`,
        });
      }
    }

    line.words.forEach((w, wi) => {
      // Zero-duration word
      if (w.endSec - w.startSec < 0.02) {
        issues.push({
          lineIndex: li,
          wordIndex: wi,
          kind: 'zero-duration',
          message: `"${w.text}" has zero duration (${w.startSec.toFixed(2)}s)`,
        });
      }
      // Word starts before previous word ends (within same line or earlier)
      if (w.startSec < prevEnd - 0.05) {
        issues.push({
          lineIndex: li,
          wordIndex: wi,
          kind: 'reverse-order',
          message: `"${w.text}" starts at ${w.startSec.toFixed(2)}s, before previous ${prevEnd.toFixed(2)}s`,
        });
      }
      prevEnd = Math.max(prevEnd, w.endSec);
    });
  });

  return issues;
}
