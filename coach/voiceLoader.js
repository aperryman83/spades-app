/**
 * coach/voiceLoader.js
 *
 * Ray's Voice DNA — Google Doc Transcript Fetcher
 *
 * This module pulls Uncle Ray's voice reference material from a
 * Google Doc that contains comedian transcripts (Katt Williams,
 * Bernie Mac, Cedric the Entertainer, Steve Harvey, etc.).
 *
 * The transcripts aren't scripts for Ray to recite — they're his
 * vocal DNA. The register, the rhythm, the cadence, the weight
 * of how words land. messageBuilder.js absorbs this and speaks from it.
 *
 * The doc is a living document — update it anytime and Ray's voice
 * updates automatically next session. Zero rewiring needed.
 *
 * Rules for this file:
 *   - READ-ONLY. Never writes to the doc.
 *   - Caches the content per session so we don't re-fetch every line.
 *   - Fails gracefully — if the doc can't be reached, Ray still works
 *     (just without the transcript reference).
 */

// ── Configuration ────────────────────────────────────────────────────────────

const VOICE_DOC_ID = '1dv3EvoRqy6M-f3gEUv7oV52j5COqnk7GAc1tiYtPQGM';

// ── Session cache (in-memory only, resets each session) ──────────────────────

let _cachedVoiceKnowledge = null;
let _cacheTimestamp = null;
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// ═════════════════════════════════════════════════════════════════════════════
// CORE: LOAD VOICE KNOWLEDGE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Fetches the voice knowledge base from the Google Doc.
 * Caches the result in memory for the session.
 *
 * Requires either:
 *   - A Google API key passed as parameter, OR
 *   - The doc to be published to the web (File > Share > Publish to web)
 *     which allows fetching as plain text without an API key
 *
 * @param {Object} [options]
 * @param {string} [options.apiKey]       — Google Docs API key (if using API route)
 * @param {boolean} [options.forceRefresh] — bypass cache and re-fetch
 * @returns {Promise<string>} — the full text content of the voice doc
 */
export async function loadVoiceKnowledge(options = {}) {
  const { apiKey, forceRefresh = false } = options;

  // ── Return cached version if still fresh ────────────────────────────────
  if (!forceRefresh && _cachedVoiceKnowledge && _cacheTimestamp) {
    const age = Date.now() - _cacheTimestamp;
    if (age < CACHE_DURATION_MS) {
      return _cachedVoiceKnowledge;
    }
  }

  // ── Try to fetch ────────────────────────────────────────────────────────
  try {
    let text;

    if (apiKey) {
      // Route 1: Google Docs API with API key
      text = await fetchViaDocsApi(apiKey);
    } else {
      // Route 2: Published-to-web export (no API key needed)
      text = await fetchViaPublishedExport();
    }

    if (text && text.trim().length > 0) {
      _cachedVoiceKnowledge = text;
      _cacheTimestamp = Date.now();
      return text;
    }

    console.warn('[voiceLoader] Doc fetched but empty — using fallback');
    return getFallbackVoiceGuide();

  } catch (err) {
    console.warn('[voiceLoader] Could not fetch voice doc:', err.message);
    console.warn('[voiceLoader] Ray will still work — using built-in voice guide');
    return getFallbackVoiceGuide();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FETCH METHODS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Fetches via Google Docs API (requires API key).
 * Doc must be shared as "Anyone with the link can view."
 */
async function fetchViaDocsApi(apiKey) {
  const url = `https://docs.googleapis.com/v1/documents/${VOICE_DOC_ID}?key=${apiKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Docs API returned ${res.status}: ${res.statusText}`);
  }

  const doc = await res.json();

  // Extract all text content from the document body
  const text = doc.body.content
    .map(block => {
      if (!block.paragraph) return '';
      return block.paragraph.elements
        .map(el => el.textRun?.content || '')
        .join('');
    })
    .join('');

  return text;
}

/**
 * Fetches via "Publish to web" plain text export (no API key needed).
 * To enable: Google Doc > File > Share > Publish to web > choose "Plain text"
 * This is the simplest route — no API key, no OAuth, just a public URL.
 */
async function fetchViaPublishedExport() {
  const url = `https://docs.google.com/document/d/${VOICE_DOC_ID}/export?format=txt`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Published export returned ${res.status}: ${res.statusText}`);
  }

  return await res.text();
}

// ═════════════════════════════════════════════════════════════════════════════
// FALLBACK — Built-in voice guide if doc can't be reached
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns a hardcoded voice guide that captures the core rules.
 * This is the safety net — Ray still sounds like Ray even offline.
 */
function getFallbackVoiceGuide() {
  return `
UNCLE RAY VOICE REGISTER — FALLBACK GUIDE

Voice references: Katt Williams, Bernie Mac, Cedric the Entertainer, Steve Harvey

RULES:
- No "Baby" — that is auntie energy, not uncle energy
- Emphasis carries the weight: "you BEEN knew that" — capitalize the emphasis word
- Dropping 'ing' to 'in' does NOT make it sound Black. That is surface-level.
- Don't announce you're about to say something. Just say it.
- When disappointed, get quieter and more specific. Not louder.
- Economy of words. Say it once, say it right.
- "We" not "you" — partnership framing
- Would a real uncle who loves you say this? That is the test.

CADENCE:
- Short punchy sentences. Let the silence do work.
- Rhetorical questions that make the player think.
- The lesson is inside the observation, not stated after it.
- Confidence without arrogance. Warmth without softness.
`.trim();
}

// ═════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns true if voice knowledge has been loaded and cached.
 */
export function isVoiceLoaded() {
  return _cachedVoiceKnowledge !== null;
}

/**
 * Clears the cache (useful for testing or manual refresh).
 */
export function clearVoiceCache() {
  _cachedVoiceKnowledge = null;
  _cacheTimestamp = null;
}

/**
 * Returns the doc ID (for debugging/display).
 */
export function getVoiceDocId() {
  return VOICE_DOC_ID;
}
