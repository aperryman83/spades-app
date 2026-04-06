/**
 * engine/trickResolver.js
 *
 * Trick winner resolution. Calls the active rules module.
 * Think of this as the Trick Judge — when all four cards are on the table,
 * this module announces who won.
 *
 * Rules for this file:
 * - NEVER imports from ui, coach, or bots
 * - Delegates winner logic entirely to activeRules.getTrickWinner()
 * - Detects if spades were broken this trick
 */

import { isTrumpCard } from './cardUtils.js';
import logger from '../utils/logger.js';

// ═════════════════════════════════════════════════════════════════════════════
// RESOLVE TRICK
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Determines the winner of a completed trick.
 *
 * @param {Array<{seat: string, card: Card}>} plays — the 4 plays in order
 * @param {string} ledSuit — the suit of the first card played
 * @param {Object} state   — current GameState (has state.activeRules)
 * @returns {{ winner: string, winningCard: Card, spadesBrokenThisTrick: boolean }}
 */
export function resolveTrick(plays, ledSuit, state) {
  if (!plays || plays.length !== 4) {
    throw new Error(`trickResolver.resolveTrick: expected 4 plays, got ${plays?.length}`);
  }

  // Delegate the winner decision to the Rule Book
  const { winner, winningCard } = state.activeRules.getTrickWinner(plays, ledSuit);

  // Check if any trump was played this trick (detects spades broken)
  const spadesBrokenThisTrick = plays.some(p => isTrumpCard(p.card, state));

  logger.info('trick_complete', {
    winner,
    winningCard: winningCard.id,
    spadesBroken: spadesBrokenThisTrick,
    ledSuit,
  });

  return {
    winner,
    winningCard,
    spadesBrokenThisTrick,
  };
}
