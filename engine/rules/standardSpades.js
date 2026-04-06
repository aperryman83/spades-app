/**
 * engine/rules/standardSpades.js
 *
 * MVP ruleset: Standard Spades.
 * Implements all 8 hooks from engine/rules/ruleInterface.js.
 *
 * Rules for this file:
 * - Must NOT import any other engine module (prevents circular deps).
 * - All Standard Spades assumptions live here and ONLY here.
 *   e.g. "card.suit === 'spades'" for trump detection lives here, not in legalMoves.
 * - Pure functions only — no side effects, no state mutation.
 * - This is the ONLY place in the codebase that encodes Standard Spades trump logic.
 */

import { shuffle } from '../../utils/helpers.js';

// ── Internal constants (Standard Spades only) ─────────────────────────────────

const STANDARD_SUITS  = ['spades', 'hearts', 'diamonds', 'clubs'];
const STANDARD_RANKS  = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const TRUMP_SUIT      = 'spades';

/**
 * Sort value base offsets.
 * Non-trump cards: 0–13 range (rank 2 = value 2, Ace = value 14)
 * Trump cards:     100+ range (ensures any spade beats any non-spade)
 * This two-tier system means getCardSortValue returns values that are directly
 * comparable across suits — no suit check needed in compareCards.
 */
const NON_TRUMP_BASE = 0;
const TRUMP_BASE     = 100;

// ── Hook: createDeck ──────────────────────────────────────────────────────────

/**
 * Builds a standard 52-card deck (no jokers), shuffled.
 * Each card has a stable unique id: "{rank}-{suit}"
 * @returns {Card[]}
 */
export function createDeck() {
  const deck = [];
  for (const suit of STANDARD_SUITS) {
    for (const rank of STANDARD_RANKS) {
      deck.push({
        id:   `${rank}-${suit}`,
        rank: rank,
        suit: suit,
      });
    }
  }
  return shuffle(deck);
}

// ── Hook: getValidBids ────────────────────────────────────────────────────────

/**
 * Returns valid bid values for Standard Spades.
 * 0 = NIL. Range: 0–13.
 * @returns {number[]}
 */
export function getValidBids() {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
}

// ── Hook: isBidAllowed ────────────────────────────────────────────────────────

/**
 * Returns true if the bid is legal in Standard Spades.
 * - Must be an integer in [0, 13]
 * - Blind Nil is not supported in MVP
 * The hand and gameState params are included for interface conformance —
 * Standard Spades has no hand-based bid restrictions.
 * @param {number} bid
 * @param {Card[]} _hand
 * @param {Object} _gameState
 * @returns {boolean}
 */
export function isBidAllowed(bid, _hand, _gameState) {
  return Number.isInteger(bid) && bid >= 0 && bid <= 13;
}

// ── Hook: isTrump ─────────────────────────────────────────────────────────────

/**
 * Returns true if the card is a trump card.
 * Standard Spades: spades are the only trump suit.
 * This is the ONLY place in the codebase that encodes this assumption.
 * @param {{ suit: string }} card
 * @returns {boolean}
 */
export function isTrump(card) {
  return card.suit === TRUMP_SUIT;
}

// ── Hook: getCardSortValue ────────────────────────────────────────────────────

/**
 * Returns a numeric sort value for trick comparison.
 * Higher value = this card beats lower values.
 *
 * Standard Spades:
 *   - Any spade beats any non-spade (two-tier value system)
 *   - Within spades:  Ace (14) = 114, King (13) = 113, ... 2 = 102
 *   - Within non-spades: Ace (14) = 14, King (13) = 13, ... 2 = 2
 *     (All non-spades share the same tier — a non-led non-trump card
 *      cannot win regardless of rank; winner logic handles this in getTrickWinner)
 *
 * @param {{ rank: number, suit: string }} card
 * @returns {number}
 */
export function getCardSortValue(card) {
  if (isTrump(card)) {
    return TRUMP_BASE + card.rank;
  }
  return NON_TRUMP_BASE + card.rank;
}

// ── Hook: canLeadTrump ────────────────────────────────────────────────────────

/**
 * Returns true if the current player is allowed to lead a trump (spade) card.
 *
 * Standard Spades rules:
 * 1. Cannot lead spades until spades are broken.
 * 2. Exception: player MAY lead spades if their hand contains ONLY spades.
 * 3. Spades are broken when a spade is played on a non-spade lead.
 *    (Never broken by leading — only by cutting.)
 *
 * @param {Card[]} hand
 * @param {{ spades_broken: boolean }} gameState
 * @returns {boolean}
 */
export function canLeadTrump(hand, gameState) {
  if (gameState.spades_broken) return true;

  // Hand contains only spades — player has no choice
  const hasNonSpade = hand.some(card => !isTrump(card));
  return !hasNonSpade;
}

// ── Hook: getTrickWinner ──────────────────────────────────────────────────────

/**
 * Determines the winner of a completed trick.
 *
 * Standard Spades resolution:
 * 1. If any spade was played → highest spade wins.
 * 2. If no spade was played → highest card of the led suit wins.
 *    (Off-suit non-trump cards that didn't follow suit cannot win.)
 *
 * @param {Array<{ seat: string, card: Card }>} trickPlays — in play order
 * @param {string} ledSuit — the suit that was led (first card's suit)
 * @returns {{ winner: string, winningCard: Card }}
 */
export function getTrickWinner(trickPlays, ledSuit) {
  if (!trickPlays || trickPlays.length === 0) {
    throw new Error('standardSpades.getTrickWinner: trickPlays is empty');
  }

  // Determine which cards are eligible to win
  const trumpPlays = trickPlays.filter(p => isTrump(p.card));
  const candidates = trumpPlays.length > 0
    ? trumpPlays
    : trickPlays.filter(p => p.card.suit === ledSuit);

  if (candidates.length === 0) {
    // Fallback — should never happen in legal play (first card is always led suit)
    throw new Error('standardSpades.getTrickWinner: no eligible winning cards found');
  }

  // Highest sort value wins
  const winner = candidates.reduce((best, play) => {
    return getCardSortValue(play.card) > getCardSortValue(best.card) ? play : best;
  });

  return {
    winner:      winner.seat,
    winningCard: winner.card,
  };
}

// ── Hook: scoreRound ──────────────────────────────────────────────────────────

/**
 * Calculates score changes at the end of a round.
 *
 * Expected roundState shape:
 * {
 *   bids:        { north: number, south: number, east: number, west: number }
 *   tricks_won:  { north: number, south: number, east: number, west: number }
 *   nil_status:  { north: NIL_STATUS, south: NIL_STATUS, ... }
 *   current_bags: { northSouth: number, eastWest: number }  // BEFORE this round
 * }
 *
 * Scoring rules (Standard Spades):
 *   Making bid:   team_score += bid × 10
 *   Bags:         team_score += 1 per overtrick; team_bags += 1 per overtrick
 *   Bag penalty:  when bags reach 10 → team_score -= 100, bags -= 10
 *   Set:          team_score -= bid × 10
 *   Nil success:  team_score += 100 (independent of partner)
 *   Nil failure:  team_score -= 100 (tricks still count toward partner bags)
 *
 * @param {Object} roundState
 * @returns {{
 *   northSouthDelta: number,
 *   eastWestDelta: number,
 *   northSouthBagsDelta: number,
 *   eastWestBagsDelta: number,
 *   northSouthPenaltyApplied: boolean,
 *   eastWestPenaltyApplied: boolean,
 * }}
 */
export function scoreRound(roundState) {
  const { bids, tricks_won, nil_status, current_bags } = roundState;

  let nsScore = 0;
  let ewScore = 0;
  let nsBags  = 0;
  let ewBags  = 0;
  let nsPenalty = false;
  let ewPenalty = false;

  // ── Process each partnership ───────────────────────────────────────────────
  for (const [partnership, seats, currentBags] of [
    ['ns', ['north', 'south'], current_bags.northSouth],
    ['ew', ['east',  'west' ], current_bags.eastWest],
  ]) {
    const isNS = partnership === 'ns';

    // Separate nil bidders from contract bidders
    const nilSeats      = seats.filter(s => nil_status[s] !== null);
    const contractSeats = seats.filter(s => nil_status[s] === null);

    // ── Nil resolution (independent of contract) ───────────────────────────
    let nilScore = 0;
    for (const seat of nilSeats) {
      if (nil_status[seat] === 'made') {
        nilScore += 100;
      } else if (nil_status[seat] === 'failed') {
        nilScore -= 100;
      }
      // Tricks taken by a failed nil bidder still count toward the partner's
      // contract total for bag purposes (handled below by using total team tricks)
    }

    // ── Contract resolution ────────────────────────────────────────────────
    // Team bid = sum of non-nil bids only
    const teamBid = contractSeats.reduce((sum, s) => sum + bids[s], 0);

    // Team tricks = ALL tricks won by both seats (nil bidder tricks count here)
    const teamTricks = seats.reduce((sum, s) => sum + tricks_won[s], 0);

    // Tricks available for bag calculation = all team tricks
    // (even nil-bidder tricks count toward the non-nil partner's bag pile)
    let contractScore = 0;
    let bagsDelta     = 0;

    if (teamBid === 0) {
      // Both players bid nil — unusual but valid
      // No contract to make or miss; bags = 0
    } else if (teamTricks >= teamBid) {
      // Made the contract
      contractScore += teamBid * 10;
      const overtricks = teamTricks - teamBid;
      contractScore += overtricks;   // +1 per bag
      bagsDelta      = overtricks;
    } else {
      // Set
      contractScore -= teamBid * 10;
    }

    // ── Bag penalty ────────────────────────────────────────────────────────
    let penaltyApplied = false;
    const newBagsTotal = currentBags + bagsDelta;
    if (newBagsTotal >= 10) {
      contractScore  -= 100;
      bagsDelta      -= 10; // net bags after penalty (reset by 10, not to zero)
      penaltyApplied = true;
    }

    // ── Accumulate ────────────────────────────────────────────────────────
    const total = nilScore + contractScore;
    if (isNS) {
      nsScore   = total;
      nsBags    = bagsDelta;
      nsPenalty = penaltyApplied;
    } else {
      ewScore   = total;
      ewBags    = bagsDelta;
      ewPenalty = penaltyApplied;
    }
  }

  return {
    northSouthDelta:          nsScore,
    eastWestDelta:            ewScore,
    northSouthBagsDelta:      nsBags,
    eastWestBagsDelta:        ewBags,
    northSouthPenaltyApplied: nsPenalty,
    eastWestPenaltyApplied:   ewPenalty,
  };
}

// ── Named module export (for validateRuleModule compatibility) ────────────────
// ruleInterface.validateRuleModule() checks for these exact exports on the object.
export const standardSpades = {
  createDeck,
  getValidBids,
  isBidAllowed,
  isTrump,
  getCardSortValue,
  canLeadTrump,
  getTrickWinner,
  scoreRound,
};

export default standardSpades;
