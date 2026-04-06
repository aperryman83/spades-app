/**
 * bots/rookieBot.js
 *
 * The Rookie — a simple AI opponent. Not very smart, plays like
 * someone who knows the rules but doesn't think ahead.
 *
 * Bidding strategy:
 * - Counts high cards (A, K, Q of any suit) and spades
 * - Bids roughly 1 per high card + 1 per extra spade
 * - Sometimes bids nil if hand is very weak
 *
 * Play strategy:
 * - If leading: plays lowest non-trump card (saves spades)
 * - If following suit: plays lowest card that can follow
 * - If can't follow suit: plays lowest trump to cut, or throws lowest card
 *
 * This bot is intentionally beatable. It makes predictable mistakes
 * so beginners can win and learn.
 */

import { getLegalCards } from '../engine/legalMoves.js';
import {
  filterBySuit,
  isTrumpCard,
  highestCard,
  lowestCard,
  sortHand,
  suitLengths,
} from '../engine/cardUtils.js';

// ═════════════════════════════════════════════════════════════════════════════
// BIDDING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Rookie bidding: count high cards and spades for a rough estimate.
 *
 * @param {Object} state — sanitized GameState
 * @param {string} seat  — this bot's seat
 * @returns {number}     — bid value (0–13)
 */
export function getBid(state, seat) {
  const hand = state.hands[seat];
  if (!hand || hand.length === 0) return 1;

  let trickEstimate = 0;

  for (const card of hand) {
    // Count aces and kings as likely tricks
    if (card.rank === 14) trickEstimate += 1;       // Ace
    if (card.rank === 13) trickEstimate += 0.8;      // King
    if (card.rank === 12) trickEstimate += 0.4;      // Queen

    // Extra spades beyond 3 add trick potential
    if (isTrumpCard(card, state) && card.rank >= 10) {
      trickEstimate += 0.3;
    }
  }

  // Count spade length bonus
  const lengths = suitLengths(hand);
  const spadesCount = lengths.spades || 0;
  if (spadesCount >= 4) trickEstimate += 0.5;
  if (spadesCount >= 5) trickEstimate += 0.5;

  // Count short suits (voids/singletons = cutting potential)
  for (const suit of ['hearts', 'diamonds', 'clubs']) {
    if (lengths[suit] === 0) trickEstimate += 0.5;
    if (lengths[suit] === 1) trickEstimate += 0.3;
  }

  // Round to nearest integer, minimum 1
  let bid = Math.round(trickEstimate);
  bid = Math.max(1, Math.min(13, bid));

  // Very weak hand = consider nil (rookie rarely bids nil though)
  if (trickEstimate < 0.8 && spadesCount <= 1) {
    bid = 0; // nil
  }

  return bid;
}

// ═════════════════════════════════════════════════════════════════════════════
// CARD PLAY
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Rookie play strategy: simple, predictable, beatable.
 *
 * @param {Object} state — sanitized GameState
 * @param {string} seat  — this bot's seat
 * @returns {Card}       — the card to play
 */
export function getPlay(state, seat) {
  const hand = state.hands[seat];
  const trickPlays = state.current_trick_plays;
  const isLeading = trickPlays.length === 0;
  const ledSuit = isLeading ? null : trickPlays[0].card.suit;

  // Get legal cards from the Referee
  const legal = getLegalCards(hand, ledSuit, isLeading, state);

  // Safety: if only one legal card, play it
  if (legal.length === 1) return legal[0];

  // ── LEADING ─────────────────────────────────────────────────────────
  if (isLeading) {
    // Prefer leading with a non-trump card (save spades)
    const nonTrump = legal.filter(c => !isTrumpCard(c, state));
    if (nonTrump.length > 0) {
      // Lead the lowest non-trump
      return lowestCard(nonTrump, state);
    }
    // All trump — lead lowest spade
    return lowestCard(legal, state);
  }

  // ── FOLLOWING SUIT ──────────────────────────────────────────────────
  const suitCards = filterBySuit(legal, ledSuit);

  if (suitCards.length > 0) {
    // Can follow suit
    // If it's the last play (4th card), try to win cheaply if possible
    if (trickPlays.length === 3) {
      // Check if we can win with lowest winning card
      const currentBest = getCurrentWinningCard(trickPlays, ledSuit, state);
      const winners = suitCards.filter(c =>
        state.activeRules.getCardSortValue(c) > state.activeRules.getCardSortValue(currentBest)
      );
      if (winners.length > 0) {
        return lowestOfGroup(winners, state); // win cheaply
      }
    }
    // Otherwise play lowest to follow
    return lowestCard(suitCards, state);
  }

  // ── CAN'T FOLLOW SUIT — decide whether to cut (play trump) ─────────
  const trumpCards = legal.filter(c => isTrumpCard(c, state));
  const nonTrumpCards = legal.filter(c => !isTrumpCard(c, state));

  if (trumpCards.length > 0) {
    // Rookie usually cuts with lowest trump
    return lowestCard(trumpCards, state);
  }

  // No trump, no suit — throw lowest card (garbage)
  return lowestCard(legal, state);
}

// ── Helper: find what's currently winning the trick ─────────────────────

function getCurrentWinningCard(trickPlays, ledSuit, state) {
  const trumpPlays = trickPlays.filter(p => isTrumpCard(p.card, state));
  if (trumpPlays.length > 0) {
    return highestCard(trumpPlays.map(p => p.card), state);
  }
  const suitPlays = trickPlays.filter(p => p.card.suit === ledSuit);
  if (suitPlays.length > 0) {
    return highestCard(suitPlays.map(p => p.card), state);
  }
  return trickPlays[0].card;
}

function lowestOfGroup(cards, state) {
  return lowestCard(cards, state);
}

// ── Export as a bot module ───────────────────────────────────────────────

export default { getBid, getPlay };
