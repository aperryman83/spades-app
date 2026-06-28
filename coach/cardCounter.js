/**
 * coach/cardCounter.js
 *
 * Ray's Memory — Card Counting & Suit Tracking
 *
 * This is Uncle Ray's photographic memory for the card table.
 * Every time a card hits the felt, Ray remembers it.
 * He tracks:
 *   - Which cards have been played (by suit)
 *   - Which big spades (A, K, Q) are gone
 *   - How many spades total have been played
 *   - Which players are void in which suits (can't follow suit = void)
 *   - Which cards are still "out there" (unplayed)
 *
 * Rules for this file:
 *   - READ-ONLY access to game state. Ray NEVER changes the Scoreboard.
 *   - No imports from ui or bots.
 *   - Pure functions — give it state, get back knowledge.
 *   - All knowledge is rebuilt from play_history each call (no hidden state).
 */

import { SUITS, PLAYER_SEATS, STANDARD_RANKS } from '../engine/constants.js';

// ── High spade threshold: Ace (14), King (13), Queen (12) ─────────────────
const HIGH_SPADE_RANKS = [14, 13, 12];

// ── Total cards per suit in a standard deck ───────────────────────────────
const CARDS_PER_SUIT = 13;
const TOTAL_SPADES = 13;

// ═════════════════════════════════════════════════════════════════════════════
// CORE: BUILD KNOWLEDGE FROM PLAY HISTORY
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Scans the entire play history and builds Ray's knowledge model.
 * Called after every card play so Ray's memory is always current.
 *
 * This is a "full rebuild" approach — no hidden state, no mutation.
 * Give it the game state, get back everything Ray knows.
 *
 * @param {Object} state — current GameState
 * @returns {Object} knowledge — Ray's complete knowledge snapshot
 */
export function buildKnowledge(state) {
  // ── Initialize empty tracking structures ──────────────────────────────
  const suitsSeen = {};
  for (const suit of SUITS) {
    suitsSeen[suit] = [];
  }

  const knownVoids = {};
  for (const seat of PLAYER_SEATS) {
    knownVoids[seat] = [];
  }

  let spadesPlayed = 0;
  const highSpadesPlayed = [];

  // ── Walk through every card that's been played this round ─────────────
  const completedTricks = state.completed_tricks || [];
  const currentTrickPlays = state.current_trick_plays || [];

  // Combine completed tricks + whatever is on the table right now
  const allPlays = [];

  for (const trick of completedTricks) {
    for (const play of trick.plays) {
      allPlays.push(play);
    }
  }
  for (const play of currentTrickPlays) {
    allPlays.push(play);
  }

  // ── Process each play ─────────────────────────────────────────────────
  // We also need to detect voids: if a player didn't follow suit
  // when a suit was led, they're void in that suit.

  // First pass: record every card seen
  for (const play of allPlays) {
    const card = play.card;
    const suit = card.suit;

    // Track the card in its suit bucket
    suitsSeen[suit].push(card);

    // Track spades specifically
    if (suit === 'spades') {
      spadesPlayed += 1;

      if (HIGH_SPADE_RANKS.includes(card.rank)) {
        highSpadesPlayed.push(card);
      }
    }
  }

  // ── Second pass: detect voids from completed tricks ───────────────────
  // A player is void in a suit if they were unable to follow suit
  // when that suit was led (i.e., they played a different suit).
  for (const trick of completedTricks) {
    if (trick.plays.length < 2) continue;

    const ledSuit = trick.plays[0].card.suit;

    for (let i = 1; i < trick.plays.length; i++) {
      const play = trick.plays[i];
      const playedSuit = play.card.suit;

      if (playedSuit !== ledSuit) {
        // This player couldn't follow suit — they're void
        if (!knownVoids[play.seat].includes(ledSuit)) {
          knownVoids[play.seat].push(ledSuit);
        }
      }
    }
  }

  // ── Also check the current trick in progress ──────────────────────────
  if (currentTrickPlays.length >= 2) {
    const ledSuit = currentTrickPlays[0].card.suit;

    for (let i = 1; i < currentTrickPlays.length; i++) {
      const play = currentTrickPlays[i];
      const playedSuit = play.card.suit;

      if (playedSuit !== ledSuit) {
        if (!knownVoids[play.seat].includes(ledSuit)) {
          knownVoids[play.seat].push(ledSuit);
        }
      }
    }
  }

  return {
    suits_seen: suitsSeen,
    known_voids: knownVoids,
    spades_played: spadesPlayed,
    high_spades_played: highSpadesPlayed,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// DERIVED QUERIES — Things Ray can figure out from his knowledge
// ═════════════════════════════════════════════════════════════════════════════

/**
 * How many spades are still out there (unplayed)?
 * @param {Object} knowledge — from buildKnowledge()
 * @returns {number}
 */
export function spadesRemaining(knowledge) {
  return TOTAL_SPADES - knowledge.spades_played;
}

/**
 * Which of the "big three" spades (A, K, Q) are still unplayed?
 * @param {Object} knowledge — from buildKnowledge()
 * @returns {number[]} — ranks of high spades still out (e.g., [14, 13] means A and K are still live)
 */
export function highSpadesStillOut(knowledge) {
  const playedRanks = knowledge.high_spades_played.map(c => c.rank);
  return HIGH_SPADE_RANKS.filter(r => !playedRanks.includes(r));
}

/**
 * How many cards of a given suit have been played?
 * @param {Object} knowledge — from buildKnowledge()
 * @param {string} suit — 'spades', 'hearts', 'diamonds', 'clubs'
 * @returns {number}
 */
export function suitCardsPlayed(knowledge, suit) {
  return knowledge.suits_seen[suit]?.length || 0;
}

/**
 * How many cards of a given suit are still unplayed?
 * @param {Object} knowledge — from buildKnowledge()
 * @param {string} suit
 * @returns {number}
 */
export function suitCardsRemaining(knowledge, suit) {
  return CARDS_PER_SUIT - suitCardsPlayed(knowledge, suit);
}

/**
 * Is a specific player known to be void in a specific suit?
 * @param {Object} knowledge — from buildKnowledge()
 * @param {string} seat — 'north', 'south', 'east', 'west'
 * @param {string} suit
 * @returns {boolean}
 */
export function isPlayerVoid(knowledge, seat, suit) {
  return knowledge.known_voids[seat]?.includes(suit) || false;
}

/**
 * Get all suits a player is known to be void in.
 * @param {Object} knowledge — from buildKnowledge()
 * @param {string} seat
 * @returns {string[]} — e.g., ['diamonds', 'hearts']
 */
export function getPlayerVoids(knowledge, seat) {
  return knowledge.known_voids[seat] || [];
}

/**
 * Returns all cards of a given suit that have been played.
 * Useful for Ray to say "The Ace and King of spades are already gone."
 * @param {Object} knowledge — from buildKnowledge()
 * @param {string} suit
 * @returns {Object[]} — array of card objects
 */
export function getPlayedCardsInSuit(knowledge, suit) {
  return knowledge.suits_seen[suit] || [];
}

/**
 * Returns the highest rank still unplayed in a suit.
 * Useful for Ray to know "the boss card" in each suit.
 * @param {Object} knowledge — from buildKnowledge()
 * @param {string} suit
 * @returns {number|null} — highest remaining rank, or null if all played
 */
export function highestRemainingInSuit(knowledge, suit) {
  const playedRanks = (knowledge.suits_seen[suit] || []).map(c => c.rank);
  for (let rank = 14; rank >= 2; rank--) {
    if (!playedRanks.includes(rank)) {
      return rank;
    }
  }
  return null; // all 13 cards of this suit have been played
}

/**
 * Does a specific player's hand still hold cards in a given suit?
 * Returns 'yes', 'no' (void), or 'unknown'.
 * Ray can only say 'no' if he caught them not following suit.
 *
 * @param {Object} knowledge — from buildKnowledge()
 * @param {string} seat
 * @param {string} suit
 * @returns {'yes'|'no'|'unknown'}
 */
export function doesPlayerHaveSuit(knowledge, seat, suit) {
  if (isPlayerVoid(knowledge, seat, suit)) {
    return 'no';
  }
  // Ray can't confirm 'yes' for opponents — he doesn't see their hands
  return 'unknown';
}

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY — A plain-English snapshot for Ray's internal use
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Produces a summary object that other coach modules can use.
 * Think of this as Ray's mental cheat sheet for the current moment.
 *
 * @param {Object} state — current GameState
 * @returns {Object} — structured summary
 */
export function getKnowledgeSummary(state) {
  const knowledge = buildKnowledge(state);

  const suitStatus = {};
  for (const suit of SUITS) {
    suitStatus[suit] = {
      played: suitCardsPlayed(knowledge, suit),
      remaining: suitCardsRemaining(knowledge, suit),
      highestRemaining: highestRemainingInSuit(knowledge, suit),
    };
  }

  const playerVoidMap = {};
  for (const seat of PLAYER_SEATS) {
    playerVoidMap[seat] = getPlayerVoids(knowledge, seat);
  }

  return {
    knowledge,
    spadesRemaining: spadesRemaining(knowledge),
    highSpadesStillOut: highSpadesStillOut(knowledge),
    suitStatus,
    playerVoids: playerVoidMap,
    totalCardsPlayed: state.play_history?.length || 0,
    trickNumber: state.current_trick,
  };
}
