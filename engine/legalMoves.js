/**
 * engine/legalMoves.js
 *
 * Legal card computation. The final source of truth for what is legal.
 * Think of this as the Referee — it decides what cards you're allowed
 * to play right now based on the rules.
 *
 * Core Spades rules enforced here:
 * 1. If a suit was led, you MUST follow suit if you have it.
 * 2. If you can't follow suit, you may play anything (including trump).
 * 3. If you're leading, you can't lead spades unless they're broken
 *    (or your hand is all spades).
 *
 * Rules for this file:
 * - NEVER imports from ui, coach, or bots
 * - Delegates trump checks to activeRules via cardUtils
 * - Logs illegal play attempts (ERROR level)
 */

import { filterBySuit, hasCardOfSuit, isTrumpCard } from './cardUtils.js';
import logger from '../utils/logger.js';

// ═════════════════════════════════════════════════════════════════════════════
// GET LEGAL CARDS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns the list of cards the player is allowed to play right now.
 *
 * @param {Card[]} hand       — the player's current hand
 * @param {string|null} ledSuit — the suit that was led this trick (null if leading)
 * @param {boolean} isLeading — true if this player is leading the trick
 * @param {Object} state      — current GameState (has state.activeRules)
 * @returns {Card[]}          — the subset of hand that is legal to play
 */
export function getLegalCards(hand, ledSuit, isLeading, state) {
  if (hand.length === 0) return [];

  // ── Leading the trick ───────────────────────────────────────────────
  if (isLeading) {
    const canLeadTrump = state.activeRules.canLeadTrump(hand, state);

    if (canLeadTrump) {
      // Can lead anything
      return [...hand];
    }

    // Can't lead trump — filter out trump cards
    const nonTrump = hand.filter(card => !isTrumpCard(card, state));

    // Safety valve: if somehow all cards are trump, allow all
    // (canLeadTrump should have caught this, but defensive coding)
    if (nonTrump.length === 0) return [...hand];

    return nonTrump;
  }

  // ── Following (not leading) ─────────────────────────────────────────
  // Must follow suit if possible
  if (ledSuit && hasCardOfSuit(hand, ledSuit)) {
    return filterBySuit(hand, ledSuit);
  }

  // Can't follow suit — may play anything (including trump / cutting)
  return [...hand];
}

// ═════════════════════════════════════════════════════════════════════════════
// IS LEGAL PLAY
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns true if playing this specific card is legal.
 * If illegal, logs an ERROR and returns false. Does NOT mutate state.
 *
 * @param {Object} card       — the card the player wants to play
 * @param {Card[]} hand       — the player's current hand
 * @param {string|null} ledSuit — the suit that was led (null if leading)
 * @param {boolean} isLeading — true if this player is leading
 * @param {Object} state      — current GameState
 * @returns {boolean}
 */
export function isLegalPlay(card, hand, ledSuit, isLeading, state) {
  const legalCards = getLegalCards(hand, ledSuit, isLeading, state);
  const isLegal = legalCards.some(c => c.id === card.id);

  if (!isLegal) {
    logger.error('illegal_play', {
      card:      card.id,
      ledSuit,
      isLeading,
      handSize:  hand.length,
      legalCount: legalCards.length,
      reason:    isLeading
        ? 'attempted to lead trump when not broken'
        : 'failed to follow suit when able',
    });
  }

  return isLegal;
}
