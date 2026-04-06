/**
 * engine/scoring.js
 *
 * Round scoring and game-end detection.
 * Think of this as the Accountant — at the end of each round,
 * it tallies up the books and checks if anyone has won or lost.
 *
 * Rules for this file:
 * - NEVER imports from ui, coach, or bots
 * - Delegates scoring math to activeRules.scoreRound()
 * - Uses WIN_SCORE and LOSS_SCORE from constants for game-end checks
 */

import { WIN_SCORE, LOSS_SCORE, SEAT_TO_PARTNERSHIP } from './constants.js';
import logger from '../utils/logger.js';

// ═════════════════════════════════════════════════════════════════════════════
// SCORE A ROUND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Calculates score deltas for the completed round.
 * Delegates the actual math to activeRules.scoreRound().
 *
 * @param {Object} state — current GameState (after all 13 tricks, nil finalized)
 * @returns {Object} — score deltas from activeRules.scoreRound()
 */
export function scoreRound(state) {
  // Build the roundState shape that the rules module expects
  const roundState = {
    bids:         state.bids,
    tricks_won:   state.tricks_won,
    nil_status:   state.nil_status,
    current_bags: {
      northSouth: state.scores.north_south.bags,
      eastWest:   state.scores.east_west.bags,
    },
  };

  const deltas = state.activeRules.scoreRound(roundState);

  logger.info('round_end', {
    round:            state.current_round,
    northSouthDelta:  deltas.northSouthDelta,
    eastWestDelta:    deltas.eastWestDelta,
    northSouthBags:   deltas.northSouthBagsDelta,
    eastWestBags:     deltas.eastWestBagsDelta,
    nsPenalty:        deltas.northSouthPenaltyApplied,
    ewPenalty:        deltas.eastWestPenaltyApplied,
  });

  return deltas;
}

// ═════════════════════════════════════════════════════════════════════════════
// CHECK GAME END
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Checks if the game is over.
 * Game ends when a team reaches WIN_SCORE (500) or drops to LOSS_SCORE (-200).
 *
 * If both teams cross 500 in the same round, the higher score wins.
 * If both teams drop below -200, the higher (less negative) score wins.
 *
 * @param {Object} state — current GameState (after applyRoundScore)
 * @returns {{ over: boolean, winner: string|null }}
 *          winner is 'northSouth' or 'eastWest' or null
 */
export function checkGameEnd(state) {
  const nsTotal = state.scores.north_south.total;
  const ewTotal = state.scores.east_west.total;

  const nsWins = nsTotal >= WIN_SCORE;
  const ewWins = ewTotal >= WIN_SCORE;
  const nsLoses = nsTotal <= LOSS_SCORE;
  const ewLoses = ewTotal <= LOSS_SCORE;

  // Both teams cross 500 — higher score wins
  if (nsWins && ewWins) {
    return {
      over: true,
      winner: nsTotal >= ewTotal ? 'northSouth' : 'eastWest',
    };
  }

  // One team wins
  if (nsWins) return { over: true, winner: 'northSouth' };
  if (ewWins) return { over: true, winner: 'eastWest' };

  // Mercy rule — team drops to or below -200
  if (nsLoses && ewLoses) {
    return {
      over: true,
      winner: nsTotal >= ewTotal ? 'northSouth' : 'eastWest',
    };
  }

  if (nsLoses) return { over: true, winner: 'eastWest' };
  if (ewLoses) return { over: true, winner: 'northSouth' };

  // Game continues
  return { over: false, winner: null };
}
