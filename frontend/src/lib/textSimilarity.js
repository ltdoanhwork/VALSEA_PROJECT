/**
 * Word-level similarity between spoken answer and expected answer.
 * Returns { score (0-100), matchedWords, totalWords, suggestion }.
 */

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalize(text).split(" ").filter(Boolean);
}

export function compareSimilarity(spoken, expected) {
  const spokenWords = tokenize(spoken);
  const expectedWords = tokenize(expected);

  if (!expectedWords.length)
    return { score: 0, matchedWords: 0, totalWords: 0, suggestion: "again" };

  const expectedSet = new Set(expectedWords);
  const matchedWords = spokenWords.filter((w) => expectedSet.has(w)).length;

  const precision = spokenWords.length
    ? matchedWords / spokenWords.length
    : 0;
  const recall = matchedWords / expectedWords.length;
  const f1 = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  const score = Math.round(f1 * 100);

  let suggestion;
  if (score >= 80) suggestion = "easy";
  else if (score >= 60) suggestion = "good";
  else if (score >= 40) suggestion = "hard";
  else suggestion = "again";

  return { score, matchedWords, totalWords: expectedWords.length, suggestion };
}
