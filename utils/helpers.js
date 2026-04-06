/**
 * utils/helpers.js
 *
 * App-level constants, UI labels, and general-purpose pure utilities.
 * Nothing here touches game rules or engine logic.
 */

import { PLAYER_MODE } from '../engine/constants.js';

// ── Coach Defaults ────────────────────────────────────────────────────────────

/** Default verbosity level (0–4). See product spec § 3. */
export const DEFAULT_VERBOSITY = 2;

/** Default intensity level (0–3). See product spec § 3. */
export const DEFAULT_INTENSITY = 2;

/** Minimum verbosity. */
export const MIN_VERBOSITY = 0;
/** Maximum verbosity. */
export const MAX_VERBOSITY = 4;

/** Minimum intensity. */
export const MIN_INTENSITY = 0;
/** Maximum intensity. */
export const MAX_INTENSITY = 3;

// ── Mode UI Labels ────────────────────────────────────────────────────────────

/** Display copy for each mode. Used by mode select screen. */
export const MODE_LABELS = {
  [PLAYER_MODE.BEGINNER]: {
    title: 'Beginner',
    description: 'Uncle Ray is always on. Every bid gets explained. Every trick gets a reaction. The best way to learn.',
    rayLine: '"I\'ll be right there with you the whole time."',
  },
  [PLAYER_MODE.MEDIUM]: {
    title: 'Medium',
    description: 'Ray is quiet unless you ask. Overlays available on demand. For players who know the basics.',
    rayLine: '"Ask me when you need me. I ain\'t going nowhere."',
  },
  [PLAYER_MODE.ADVANCED]: {
    title: 'Advanced',
    description: 'No hints. No overlays. Ray watches silently — except when it really matters.',
    rayLine: '"Alright, prove it."',
  },
};

// ── Score Display ─────────────────────────────────────────────────────────────

/** Format a score delta for display: +50, -100, 0 */
export function formatScoreDelta(delta) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '0';
}

/** Format bags count for display: "3 bags" or "1 bag" */
export function formatBags(count) {
  return count === 1 ? '1 bag' : `${count} bags`;
}

// ── Card Display ──────────────────────────────────────────────────────────────

/**
 * Returns the CSS class suffix for a suit, used for color assignment.
 * Red suits: hearts, diamonds. Black suits: spades, clubs.
 * @param {string} suit
 * @returns {'hearts'|'diamonds'|'spades'|'clubs'}
 */
export function suitColorClass(suit) {
  return suit; // maps directly to CSS class names .card__rank--{suit}
}

/** Returns true if suit is red (hearts or diamonds). */
export function isRedSuit(suit) {
  return suit === 'hearts' || suit === 'diamonds';
}

// ── Array / Random Utilities ──────────────────────────────────────────────────

/**
 * Fisher-Yates shuffle. Returns a new shuffled array (does not mutate input).
 * @param {Array} arr
 * @returns {Array}
 */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Returns a random integer in [min, max] inclusive.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random element from an array.
 * @param {Array} arr
 * @returns {*}
 */
export function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Clamps a value between min and max inclusive.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ── Timing Utilities ──────────────────────────────────────────────────────────

/**
 * Returns a Promise that resolves after `ms` milliseconds.
 * Used for bot artificial delay.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── DOM Utilities ─────────────────────────────────────────────────────────────

/**
 * Shorthand for document.querySelector.
 * @param {string} selector
 * @param {Element} [root=document]
 * @returns {Element|null}
 */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * Shorthand for document.querySelectorAll, returns a real Array.
 * @param {string} selector
 * @param {Element} [root=document]
 * @returns {Element[]}
 */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Creates an element with optional classes and attributes.
 * @param {string} tag
 * @param {string[]} [classes=[]]
 * @param {Object} [attrs={}]
 * @returns {Element}
 */
export function createElement(tag, classes = [], attrs = {}) {
  const el = document.createElement(tag);
  if (classes.length) el.classList.add(...classes);
  for (const [key, val] of Object.entries(attrs)) {
    el.setAttribute(key, val);
  }
  return el;
}

/**
 * Removes all children from an element.
 * @param {Element} el
 */
export function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
