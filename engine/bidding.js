/**
 * engine/bidding.js
 *
 * Bid validation only. Calls the active rules module.
 * Think of this as the Bid Clerk — it checks if a bid is legal
 * before recording it on the Scoreboard. No recommendations here;
 * that's Uncle Ray's job (coach/biddingTutor.js).
 *
 * Rules for this file:
 * - NEVER imports from ui, coach, or bots
 * - Delegates all rule-specific bid checks to activeRules
 * - No recommendation logic
 */

import { SEAT_PARTNER, PARTNERSHIPS, SEAT_TO_PARTNERSHIP } from './constants.js';
import logger from '../utils/logger.js';

// ═════════════════════════════════════════════════════════════════════════════
// BID VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns true if the bid is legal under the active ruleset.
 * Delegates to activeRules.isBidAllowed().
 *
 * @param {number} bid       — the proposed bid value
 * @param {Card[]} hand      — the bidder's hand
 * @param {Object} state     — current GameState (has state.activeRules)
 * @returns {boolean}
 */
export function isValidBid(bid, hand, state) {
  const allowed = state.activeRules.isBidAllowed(bid, hand, state);

  if (!allowed) {
    logger.warn('bid_rejected', { bid, reason: 'not allowed by active rules' });
  }

  return allowed;
}

// ═════════════════════════════════════════════════════════════════════════════
// TEAM BID CALCULATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns the combined bid for a partnership.
 * Nil bids (0) are treated as 0 in the sum — they don't add to the team contract.
 *
 * @param {Object} bids — { north: number|null, south: number|null, ... }
 * @param {string} partnership — 'northSouth' or 'eastWest'
 * @returns {number} — sum of partner bids (null bids treated as 0)
 */
export function getTeamBid(bids, partnership) {
  const seats = PARTNERSHIPS[partnership];
  return seats.reduce((sum, seat) => {
    const bid = bids[seat];
    return sum + (bid ?? 0);
  }, 0);
}

/**
 * Returns the partner's bid for a given seat, or null if partner hasn't bid yet.
 *
 * @param {Object} bids — { north: number|null, south: number|null, ... }
 * @param {string} seat — the seat whose partner's bid we want
 * @returns {number|null}
 */
export function getPartnerBid(bids, seat) {
  const partnerSeat = SEAT_PARTNER[seat];
  return bids[partnerSeat];
}
