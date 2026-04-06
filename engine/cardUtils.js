/**
 * engine/cardUtils.js
 *
 * Shared helpers for card manipulation.
 * Used by: trickResolver, legalMoves, bots, coach.
 *
 * CRITICAL RULES FOR THIS FILE:
 * - This file does NOT import any rules module (not standardSpades, not jjddVariant).
 * - When a function needs trump status or sort order, it reads state.activeRules.
 * - Functions that don't need ranking receive no rules parameter and make no assumptions.
 * - isSameCard ALWAYS compares by card.id — never by rank+suit object equality.
 */

import { RANK_DISPLAY, SUIT_SYMBOL } from './constants.js';

// ── Card Identity ─────────────────────────────────────────────────────────────

/**
 * The canonical card equality check.
 * Every card must have a stable unique id assigned at deck creation.
 * card.id format: "{rank}-{suit}" e.g. "14-spades", "11-hearts"
 * For JJDD jokers: "joker-big", "joker-little"
 *
 * @param {Card} a
 * @param {Card} b
 * @returns {boolean}
 */
export function isSameCard(a, b) {
  if (!a || !b) return false;
  return a.id === b.id;
}

// ── Card Normalization ────────────────────────────────────────────────────────

/**
 * Ensures a card has the expected shape: { id, rank, suit }.
 * Throws if required fields are missing — fail loudly rather than silently.
 * @param {*} card
 * @returns {{ id: string, rank: number, suit: string }}
 */
export function normalizeCard(card) {
  if (!card || typeof card !== 'object') {
    throw new Error(`cardUtils.normalizeCard: expected object, got ${typeof card}`);
  }
  if (!card.id)   throw new Error(`cardUtils.normalizeCard: card missing id`);
  if (!card.suit) throw new Error(`cardUtils.normalizeCard: card missing suit (id: ${card.id})`);
  if (card.rank === undefined || card.rank === null) {
    throw new Error(`cardUtils.normalizeCard: card missing rank (id: ${card.id})`);
  }
  return { id: card.id, rank: card.rank, suit: card.suit };
}

// ── Display Helpers ───────────────────────────────────────────────────────────

/**
 * Returns a human-readable label for a card: "A♠", "10♥", "J♦"
 * @param {Card} card
 * @returns {string}
 */
export function cardLabel(card) {
  const rank = RANK_DISPLAY[card.rank] ?? String(card.rank);
  const suit = SUIT_SYMBOL[card.suit] ?? card.suit;
  return `${rank}${suit}`;
}

/**
 * Returns the suit symbol string: "♠" | "♥" | "♦" | "♣"
 * @param {string} suit
 * @returns {string}
 */
export function suitSymbol(suit) {
  return SUIT_SYMBOL[suit] ?? suit;
}

/**
 * Returns the display label for a rank integer.
 * @param {number} rank
 * @returns {string}
 */
export function rankLabel(rank) {
  return RANK_DISPLAY[rank] ?? String(rank);
}

// ── Trump-Aware Functions (require state.activeRules) ─────────────────────────

/**
 * Returns true if the card is a trump card under the active ruleset.
 * Reads trump definition from state.activeRules — never hardcodes "spades".
 * @param {Card} card
 * @param {GameState} state  — must have state.activeRules
 * @returns {boolean}
 */
export function isTrumpCard(card, state) {
  return state.activeRules.isTrump(card);
}

/**
 * Compares two cards under the active ruleset.
 * Returns positive if cardA beats cardB, negative if cardB beats cardA, 0 if equal value.
 * @param {Card} cardA
 * @param {Card} cardB
 * @param {GameState} state
 * @returns {number}
 */
export function compareCards(cardA, cardB, state) {
  const valA = state.activeRules.getCardSortValue(cardA);
  const valB = state.activeRules.getCardSortValue(cardB);
  return valA - valB;
}

/**
 * Sorts a hand for display: trumps grouped together at the right, then by suit,
 * high to low within each group. Returns a new array — does NOT mutate hand.
 * @param {Card[]} hand
 * @param {GameState} state
 * @returns {Card[]}
 */
export function sortHand(hand, state) {
  return [...hand].sort((a, b) => {
    const aTrump = isTrumpCard(a, state);
    const bTrump = isTrumpCard(b, state);

    // Trumps always sort after non-trumps (rightmost in hand)
    if (aTrump && !bTrump) return 1;
    if (!aTrump && bTrump) return -1;

    // Within same trump/non-trump group: sort by suit alphabetically first
    // (keeps suits grouped visually), then high to low within suit
    if (a.suit !== b.suit) {
      // Custom suit display order: spades, hearts, diamonds, clubs
      const suitOrder = { spades: 3, hearts: 2, diamonds: 1, clubs: 0 };
      const aOrd = suitOrder[a.suit] ?? -1;
      const bOrd = suitOrder[b.suit] ?? -1;
      return bOrd - aOrd;
    }

    // Same suit: higher sort value (better card) first
    return compareCards(b, a, state);
  });
}

// ── Pure Suit Filters (no rules needed) ───────────────────────────────────────

/**
 * Returns all cards in the hand matching the given suit.
 * @param {Card[]} hand
 * @param {string} suit
 * @returns {Card[]}
 */
export function filterBySuit(hand, suit) {
  return hand.filter(c => c.suit === suit);
}

/**
 * Returns true if the hand contains at least one card of the given suit.
 * @param {Card[]} hand
 * @param {string} suit
 * @returns {boolean}
 */
export function hasCardOfSuit(hand, suit) {
  return hand.some(c => c.suit === suit);
}

/**
 * Returns a new array with the specified card removed.
 * Uses isSameCard (id-based) — does NOT mutate the original hand.
 * Throws if the card is not found (defensive — should never happen in legal play).
 * @param {Card[]} hand
 * @param {Card} card
 * @returns {Card[]}
 */
export function removeCard(hand, card) {
  const idx = hand.findIndex(c => isSameCard(c, card));
  if (idx === -1) {
    throw new Error(`cardUtils.removeCard: card ${card.id} not found in hand`);
  }
  const result = [...hand];
  result.splice(idx, 1);
  return result;
}

/**
 * Returns true if the hand contains the specified card (by id).
 * @param {Card[]} hand
 * @param {Card} card
 * @returns {boolean}
 */
export function handContains(hand, card) {
  return hand.some(c => isSameCard(c, card));
}

// ── Hand Analysis Utilities ───────────────────────────────────────────────────

/**
 * Returns the highest card in a collection under the active ruleset.
 * @param {Card[]} cards — must not be empty
 * @param {GameState} state
 * @returns {Card}
 */
export function highestCard(cards, state) {
  if (!cards.length) throw new Error('cardUtils.highestCard: empty array');
  return cards.reduce((best, card) => compareCards(card, best, state) > 0 ? card : best);
}

/**
 * Returns the lowest card in a collection under the active ruleset.
 * @param {Card[]} cards — must not be empty
 * @param {GameState} state
 * @returns {Card}
 */
export function lowestCard(cards, state) {
  if (!cards.length) throw new Error('cardUtils.lowestCard: empty array');
  return cards.reduce((worst, card) => compareCards(card, worst, state) < 0 ? card : worst);
}

/**
 * Groups a hand by suit.
 * @param {Card[]} hand
 * @returns {Object.<string, Card[]>}  e.g. { spades: [...], hearts: [...], ... }
 */
export function groupBySuit(hand) {
  return hand.reduce((groups, card) => {
    if (!groups[card.suit]) groups[card.suit] = [];
    groups[card.suit].push(card);
    return groups;
  }, {});
}

/**
 * Returns the number of cards of each suit in the hand.
 * @param {Card[]} hand
 * @returns {Object.<string, number>}
 */
export function suitLengths(hand) {
  const groups = groupBySuit(hand);
  const lengths = {};
  for (const suit of ['spades', 'hearts', 'diamonds', 'clubs']) {
    lengths[suit] = (groups[suit] || []).length;
  }
  return lengths;
}
