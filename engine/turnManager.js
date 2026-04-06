/**
 * engine/turnManager.js
 *
 * Turn order and phase management.
 * Keeps deal rotation and phase transitions in one explicit place
 * rather than scattered across gameState.
 *
 * Think of this as the Floor Manager at the card table —
 * it knows who goes next, who deals, and when a phase is complete.
 *
 * Rules for this file:
 * - NEVER imports from ui, coach, or bots
 * - No trump or scoring logic
 * - Uses CLOCKWISE_FROM from constants for turn order
 */

import {
  PLAYER_SEATS,
  CLOCKWISE_FROM,
  MAX_TRICKS_PER_HAND,
} from './constants.js';

// ═════════════════════════════════════════════════════════════════════════════
// SEAT NAVIGATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns the next seat clockwise from the given seat.
 * north → east → south → west → north
 *
 * @param {string} currentSeat
 * @returns {string}
 */
export function getNextSeat(currentSeat) {
  const order = CLOCKWISE_FROM[currentSeat];
  return order[1]; // index 0 is self, index 1 is next clockwise
}

/**
 * Returns the seat to the left of the dealer (first to bid and lead).
 * In clockwise order, "left of dealer" = next seat clockwise.
 *
 * @param {string} dealerSeat
 * @returns {string}
 */
export function getSeatLeftOfDealer(dealerSeat) {
  return getNextSeat(dealerSeat);
}

/**
 * Returns the next dealer (rotates clockwise each round).
 *
 * @param {string} currentDealer
 * @returns {string}
 */
export function getNextDealer(currentDealer) {
  return getNextSeat(currentDealer);
}

// ═════════════════════════════════════════════════════════════════════════════
// TURN ADVANCEMENT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns updated state with current_turn advanced to next seat clockwise.
 *
 * @param {Object} state — current GameState
 * @returns {Object} — updated GameState
 */
export function advanceTurn(state) {
  return {
    ...state,
    current_turn: getNextSeat(state.current_turn),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// BIDDING ORDER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns the full bidding order starting from the seat left of dealer.
 * Always 4 seats in clockwise order.
 *
 * @param {string} dealerSeat
 * @returns {string[]} — array of 4 seats in bidding order
 */
export function getBiddingOrder(dealerSeat) {
  const firstBidder = getSeatLeftOfDealer(dealerSeat);
  return CLOCKWISE_FROM[firstBidder];
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE COMPLETION CHECKS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns true if all 13 tricks have been played this round.
 *
 * @param {Object} state — current GameState
 * @returns {boolean}
 */
export function isRoundComplete(state) {
  return state.completed_tricks.length >= MAX_TRICKS_PER_HAND;
}

/**
 * Returns true if all 4 players have submitted a bid.
 *
 * @param {Object} state — current GameState
 * @returns {boolean}
 */
export function isBiddingComplete(state) {
  return PLAYER_SEATS.every(seat => state.bids[seat] !== null);
}

/**
 * Returns true if all 4 cards have been played in the current trick.
 *
 * @param {Object} state — current GameState
 * @returns {boolean}
 */
export function isTrickComplete(state) {
  return state.current_trick_plays.length === 4;
}
