/**
 * engine/gameState.js
 *
 * The Master Scoreboard.
 * This is the single source of truth for everything happening in the game.
 * "If it's not on the scoreboard, it didn't happen."
 *
 * Responsibilities:
 * - Defines the complete game state shape
 * - Creates the initial state at game start
 * - Deals cards to all four players
 * - Records bids
 * - Records card plays (removes from hand, adds to trick, updates history)
 * - Detects spades broken
 * - Detects nil failure (immediate)
 * - Records trick results (winner, tricks_won counter)
 * - Resets state for a new round (keeps scores, resets hands/bids/tricks)
 *
 * Rules for this file:
 * - NEVER imports from ui, coach, or bots
 * - All state changes return a NEW object (immutable updates)
 * - The activeRules reference lives on state so all layers can reach it
 * - Uses logger for mandatory log points
 */

import {
  PLAYER_SEATS,
  GAME_PHASE,
  PLAYER_MODE,
  RULESET,
  NIL_STATUS,
  BID_NIL,
  MAX_TRICKS_PER_HAND,
  HUMAN_SEAT,
  CLOCKWISE_FROM,
} from './constants.js';

import { removeCard, isTrumpCard } from './cardUtils.js';
import { validateRuleModule } from './rules/ruleInterface.js';
import logger from '../utils/logger.js';
import { DEFAULT_VERBOSITY, DEFAULT_INTENSITY } from '../utils/helpers.js';

// ── Unique ID generator (simple, no external deps) ──────────────────────────

let _gameIdCounter = 0;

function generateGameId() {
  _gameIdCounter += 1;
  return `game-${Date.now()}-${_gameIdCounter}`;
}

// ── Empty seat maps (used to build fresh state) ─────────────────────────────

function emptySeatMap(value) {
  const map = {};
  for (const seat of PLAYER_SEATS) {
    map[seat] = typeof value === 'function' ? value() : value;
  }
  return map;
}

// ── Knowledge Model skeleton ────────────────────────────────────────────────

/**
 * Creates a fresh knowledge model for one seat.
 * The coach/cardCounter module will populate this during play.
 * Defined here so the Scoreboard shape is complete from the start.
 */
function createEmptyKnowledge() {
  return {
    suits_seen: { spades: [], hearts: [], diamonds: [], clubs: [] },
    known_voids: { north: [], south: [], east: [], west: [] },
    spades_played: 0,
    high_spades_played: [],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATE INITIAL GAME STATE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Creates the master Scoreboard for a brand-new game.
 *
 * @param {string} mode — 'beginner' | 'medium' | 'advanced'
 * @param {Object} activeRules — the loaded rules module (standardSpades in MVP)
 * @param {Object} [options] — optional overrides for settings
 * @returns {Object} — the complete GameState object
 */
export function createInitialGameState(mode, activeRules, options = {}) {
  // ── Validate the rules module before anything else ────────────────────
  const rulesetName = options.ruleset || RULESET.STANDARD;
  validateRuleModule(activeRules, rulesetName);

  const state = {
    // ── Identity ──────────────────────────────────────────────────────
    game_id: generateGameId(),
    mode:    mode,
    status:  GAME_PHASE.DEALING,

    // ── Rules ─────────────────────────────────────────────────────────
    activeRuleset: rulesetName,
    activeRules:   activeRules,

    // ── Round tracking ────────────────────────────────────────────────
    current_round:  1,
    current_trick:  1,
    current_turn:   null,   // set after dealing, when bidding starts
    dealer_seat:    'north', // first dealer; rotates each round
    spades_broken:  false,

    // ── Scores (persist across rounds) ────────────────────────────────
    scores: {
      north_south: { total: 0, bags: 0 },
      east_west:   { total: 0, bags: 0 },
    },

    // ── Per-round tracking (reset each round) ─────────────────────────
    bids:       emptySeatMap(null),
    tricks_won: emptySeatMap(0),
    nil_status: emptySeatMap(NIL_STATUS.NONE),

    // ── Hands ─────────────────────────────────────────────────────────
    hands: emptySeatMap(() => []),

    // ── Trick and play history ────────────────────────────────────────
    current_trick_plays: [],
    completed_tricks:    [],
    play_history:        [],

    // ── Knowledge models (one per seat, for the coach) ────────────────
    knowledge: {
      north: createEmptyKnowledge(),
      south: createEmptyKnowledge(),
      east:  createEmptyKnowledge(),
      west:  createEmptyKnowledge(),
    },

    // ── Round summaries (appended at each round end) ──────────────────
    rounds: [],

    // ── Settings ──────────────────────────────────────────────────────
    settings: {
      verbosity:  options.verbosity  ?? DEFAULT_VERBOSITY,
      intensity:  options.intensity  ?? DEFAULT_INTENSITY,
      mercy_loss: options.mercy_loss ?? true,
    },
  };

  // ── Mandatory log point ─────────────────────────────────────────────
  logger.info('game_init', {
    game_id:  state.game_id,
    ruleset:  state.activeRuleset,
    mode:     state.mode,
  });

  return state;
}

// ═════════════════════════════════════════════════════════════════════════════
// DEAL HANDS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Shuffles the deck and distributes 13 cards to each player.
 * Returns a new state with hands populated and status set to BIDDING.
 *
 * @param {Object} state — current GameState
 * @returns {Object} — updated GameState with hands dealt
 */
export function dealHands(state) {
  const deck = state.activeRules.createDeck(); // returns a shuffled 52-card deck

  const hands = {
    north: deck.slice(0, 13),
    east:  deck.slice(13, 26),
    south: deck.slice(26, 39),
    west:  deck.slice(39, 52),
  };

  // The player to the left of the dealer bids first (and leads first)
  const dealerIndex = PLAYER_SEATS.indexOf(state.dealer_seat);
  const clockwiseOrder = CLOCKWISE_FROM[state.dealer_seat];
  const firstBidder = clockwiseOrder[1]; // seat to the left of dealer

  const newState = {
    ...state,
    hands,
    status:       GAME_PHASE.BIDDING,
    current_turn: firstBidder,
  };

  logger.info('round_start', {
    round:   newState.current_round,
    dealer:  newState.dealer_seat,
    first_bidder: firstBidder,
  });

  return newState;
}

// ═════════════════════════════════════════════════════════════════════════════
// RECORD BID
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Records a player's bid on the Scoreboard.
 * If the bid is NIL (0), sets nil_status to ACTIVE for that player.
 *
 * @param {Object} state — current GameState
 * @param {string} seat  — the player seat ('north', 'south', etc.)
 * @param {number} bid   — the bid value (0 = NIL, 1–13)
 * @returns {Object} — updated GameState
 */
export function recordBid(state, seat, bid) {
  const newBids = { ...state.bids, [seat]: bid };

  const newNilStatus = { ...state.nil_status };
  if (bid === BID_NIL) {
    newNilStatus[seat] = NIL_STATUS.ACTIVE;
  }

  logger.info('bid_confirmed', { seat, bid });

  return {
    ...state,
    bids:       newBids,
    nil_status: newNilStatus,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// APPLY CARD PLAY
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Records a card being played.
 * - Removes the card from the player's hand
 * - Adds it to current_trick_plays and play_history
 * - Checks if spades are now broken
 *
 * NOTE: nil_status failure is NOT checked here — it's checked in
 * applyTrickResult, because you can't know who won the trick until
 * all four cards are played.
 *
 * @param {Object} state — current GameState
 * @param {string} seat  — the player seat
 * @param {Object} card  — the card being played
 * @returns {Object} — updated GameState
 */
export function applyCardPlay(state, seat, card) {
  // Remove card from the player's hand (immutable)
  const newHand = removeCard(state.hands[seat], card);
  const newHands = { ...state.hands, [seat]: newHand };

  // Build the trick play record
  const trickPlay = {
    seat,
    card,
    trick_number: state.current_trick,
    round_number: state.current_round,
  };

  // Add to current trick and full history
  const newTrickPlays = [...state.current_trick_plays, trickPlay];
  const newPlayHistory = [...state.play_history, trickPlay];

  // Check if spades are now broken
  let newSpadesBroken = state.spades_broken;
  if (!state.spades_broken && isTrumpCard(card, state)) {
    newSpadesBroken = true;
    logger.info('spades_broken', {
      seat,
      card: card.id,
      trick: state.current_trick,
    });
  }

  return {
    ...state,
    hands:               newHands,
    current_trick_plays: newTrickPlays,
    play_history:        newPlayHistory,
    spades_broken:       newSpadesBroken,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// APPLY TRICK RESULT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Records the outcome of a completed trick.
 * - Increments tricks_won for the winner
 * - Archives the trick to completed_tricks
 * - Clears current_trick_plays
 * - Advances current_trick counter
 * - Sets the winner as the next player to lead (current_turn)
 * - Checks if a nil bidder just won a trick (immediate failure)
 *
 * @param {Object} state       — current GameState
 * @param {Object} trickResult — from trickResolver: { winner, winningCard, spadesBrokenThisTrick }
 * @returns {Object} — updated GameState
 */
export function applyTrickResult(state, trickResult) {
  const { winner, winningCard } = trickResult;

  // Increment tricks won for the winner
  const newTricksWon = {
    ...state.tricks_won,
    [winner]: state.tricks_won[winner] + 1,
  };

  // Check nil failure — if the trick winner had bid nil, they've failed
  const newNilStatus = { ...state.nil_status };
  if (newNilStatus[winner] === NIL_STATUS.ACTIVE) {
    newNilStatus[winner] = NIL_STATUS.FAILED;
    logger.info('nil_failed', { seat: winner, trick: state.current_trick });
  }

  // Archive the completed trick
  const completedTrick = {
    trick_number: state.current_trick,
    plays:        [...state.current_trick_plays],
    winner,
    winning_card: winningCard,
  };

  const newCompletedTricks = [...state.completed_tricks, completedTrick];

  return {
    ...state,
    tricks_won:          newTricksWon,
    nil_status:          newNilStatus,
    completed_tricks:    newCompletedTricks,
    current_trick_plays: [],                         // cleared for next trick
    current_trick:       state.current_trick + 1,    // advance counter
    current_turn:        winner,                      // winner leads next
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// FINALIZE NIL RESULTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Called at round end to finalize nil outcomes.
 * Any nil_status still 'active' at the end of 13 tricks means they made it.
 *
 * @param {Object} state — current GameState (after all 13 tricks)
 * @returns {Object} — updated GameState with nil_status finalized
 */
export function finalizeNilResults(state) {
  const newNilStatus = { ...state.nil_status };

  for (const seat of PLAYER_SEATS) {
    if (newNilStatus[seat] === NIL_STATUS.ACTIVE) {
      newNilStatus[seat] = NIL_STATUS.MADE;
      logger.info('nil_made', { seat, round: state.current_round });
    }
  }

  return {
    ...state,
    nil_status: newNilStatus,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// APPLY ROUND SCORE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Applies score deltas from the scoring module to the Scoreboard.
 * Also archives a round summary for the history.
 *
 * @param {Object} state  — current GameState
 * @param {Object} deltas — from scoring.js: { northSouthDelta, eastWestDelta,
 *                            northSouthBagsDelta, eastWestBagsDelta, ... }
 * @returns {Object} — updated GameState with new scores
 */
export function applyRoundScore(state, deltas) {
  const newScores = {
    north_south: {
      total: state.scores.north_south.total + deltas.northSouthDelta,
      bags:  state.scores.north_south.bags  + deltas.northSouthBagsDelta,
    },
    east_west: {
      total: state.scores.east_west.total + deltas.eastWestDelta,
      bags:  state.scores.east_west.bags  + deltas.eastWestBagsDelta,
    },
  };

  // Archive the round summary
  const roundSummary = {
    round:       state.current_round,
    bids:        { ...state.bids },
    tricks_won:  { ...state.tricks_won },
    nil_status:  { ...state.nil_status },
    deltas,
    scores_after: {
      north_south: { ...newScores.north_south },
      east_west:   { ...newScores.east_west },
    },
  };

  return {
    ...state,
    scores: newScores,
    rounds: [...state.rounds, roundSummary],
    status: GAME_PHASE.ROUND_END,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// START NEW ROUND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Resets the Scoreboard for a new round.
 * Keeps: scores, rounds history, settings, rules, mode, game_id.
 * Resets: hands, bids, tricks, nil_status, trick history, spades_broken.
 * Rotates: dealer to the next seat clockwise.
 *
 * @param {Object} state — current GameState (after round_end)
 * @returns {Object} — fresh GameState ready for dealing
 */
export function startNewRound(state) {
  // Rotate dealer clockwise
  const clockwiseOrder = CLOCKWISE_FROM[state.dealer_seat];
  const nextDealer = clockwiseOrder[1];

  return {
    ...state,

    // ── Advance round ─────────────────────────────────────────────────
    current_round:  state.current_round + 1,
    current_trick:  1,
    current_turn:   null,   // set when dealHands runs
    dealer_seat:    nextDealer,
    status:         GAME_PHASE.DEALING,
    spades_broken:  false,

    // ── Reset per-round data ──────────────────────────────────────────
    bids:                emptySeatMap(null),
    tricks_won:          emptySeatMap(0),
    nil_status:          emptySeatMap(NIL_STATUS.NONE),
    hands:               emptySeatMap(() => []),
    current_trick_plays: [],
    completed_tricks:    [],
    play_history:        [],

    // ── Reset knowledge models ────────────────────────────────────────
    knowledge: {
      north: createEmptyKnowledge(),
      south: createEmptyKnowledge(),
      east:  createEmptyKnowledge(),
      west:  createEmptyKnowledge(),
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// STATUS TRANSITIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Sets the game status (phase). Used by the controller for transitions
 * that aren't covered by the specific functions above.
 *
 * @param {Object} state  — current GameState
 * @param {string} status — one of GAME_PHASE values
 * @returns {Object} — updated GameState
 */
export function setStatus(state, status) {
  return { ...state, status };
}

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS UPDATE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Updates one or more settings on the Scoreboard.
 * Used by the UI when the player adjusts verbosity/intensity sliders.
 *
 * @param {Object} state      — current GameState
 * @param {Object} newSettings — partial settings object to merge
 * @returns {Object} — updated GameState
 */
export function updateSettings(state, newSettings) {
  return {
    ...state,
    settings: { ...state.settings, ...newSettings },
  };
}
