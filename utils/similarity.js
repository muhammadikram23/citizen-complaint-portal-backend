/**
 * Similarity & Text Tokenization Utilities for Duplicate Complaint Detection
 */

const STOPWORDS = new Set([
  'the', 'is', 'are', 'and', 'for', 'near', 'with', 'has', 'been', 'this',
  'that', 'from', 'our', 'out', 'very', 'there', 'here', 'have', 'had',
  'was', 'were', 'not', 'but', 'all', 'any', 'can', 'her', 'his', 'how',
  'its', 'may', 'new', 'now', 'off', 'old', 'one', 'our', 'see', 'she',
  'too', 'two', 'who', 'you', 'about', 'above', 'after', 'again', 'against'
]);

function normalizeArea(area = '') {
  return String(area)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ''); // Strips spaces, hyphens, and punctuation: "Sector G-9" & "sector g9" -> "sectorg9"
}

function tokenize(text = '') {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccardSimilarity(setA, setB) {
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

module.exports = {
  normalizeArea,
  tokenize,
  jaccardSimilarity,
  STOPWORDS,
};
