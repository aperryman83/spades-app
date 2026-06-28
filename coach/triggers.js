/**
 * coach/triggers.js
 *
 * Ray's Security Cameras — Event Detection System
 *
 * This module watches the game state and detects "moments worth
 * commenting on." It doesn't decide WHAT Ray says — it just flags
 * WHEN he should speak up and WHY.
 *
 * Think of it like a newsroom scanner: it monitors the police radio
 * (game events) and decides which stories are worth sending a reporter
 * to cover. The reporter (messageBuilder) decides how to write it up.
 *
 * Each trigger returns a structured object describing what happened,
 * so downstream modules (biddingTutor, playAdvisor, messageBuilder)
 * know exactly what situation they're dealing with.
 *
 * Rules for this file:
 *   - READ-ONLY access to game state. Never changes the Scoreboard.
 *   - No imports from ui or bots.
 *   - Pure functions — give it state (and optionally previous state),
 *     get back a list of triggered events.
 */

import {
  PLAYER_SEATS,
  HUMAN_SEAT,
  SEAT_PARTNER,
  GAME_PHASE,
  NIL_STATUS,
  BID_NIL,
  MAX_TRICKS_PER_HAND,
  SEAT_TO_PARTNERSHIP,
} from '../engine/constants.js';

import { buildKnowledge, spadesRemaining, highSpadesStillOut } from './cardCounter.js';

// ═════════════════════════════════════════════════════════════════════════════
// TRIGGER TYPES — The catalog of events Ray watches for
// ═════════════════════════════════════════════════════════════════════════════

export const TRIGGER = {
  // ── Bidding Phase ────────────────────────────────────────────────────
  BIDDING_START:         'bidding_start',          // Time for human to bid
  PARTNER_BID_PLACED:    'partner_bid_placed',     // North (partner) just bid
  OPPONENT_BID_PLACED:   'opponent_bid_placed',    // East or West just bid
  ALL_BIDS_IN:           'all_bids_in',            // All 4 bids placed, play about to start
  NIL_BID_DETECTED:      'nil_bid_detected',       // Someone bid nil

  // ── Play Phase — Card Events ─────────────────────────────────────────
  HUMAN_TURN:            'human_turn',             // It's the human's turn to play
  TRICK_COMPLETE:        'trick_complete',          // A trick just finished
  SPADES_BROKEN:         'spades_broken',           // Spades were broken this round
  ROUND_COMPLETE:        'round_complete',          // All 13 tricks done

  // ── Play Phase — Strategic Moments ───────────────────────────────────
  NIL_IN_DANGER:         'nil_in_danger',           // A nil bidder might take a trick
  NIL_FAILED:            'nil_failed',              // A nil bidder took a trick
  NIL_SUCCEEDED:         'nil_succeeded',           // Nil bidder made it through
  OVERBID_RISK:          'overbid_risk',            // Team is falling short of their bid
  UNDERBID_RISK:         'underbid_risk',            // Team is taking way more tricks than bid
  BAG_WARNING:           'bag_warning',              // Team is approaching bag penalty
  BIG_SPADE_PLAYED:      'big_spade_played',        // A, K, or Q of spades just dropped
  OPPONENT_VOID_DETECTED:'opponent_void_detected',  // An opponent can't follow suit
  PARTNER_VOID_DETECTED: 'partner_void_detected',   // Partner can't follow suit

  // ── Game Phase ───────────────────────────────────────────────────────
  GAME_OVER:             'game_over',               // Somebody won (or lost)
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN: DETECT TRIGGERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The main entry point. Compares current state to previous state and
 * returns an array of all triggers that just fired.
 *
 * @param {Object} state     — current GameState
 * @param {Object} prevState — previous GameState (before last action)
 * @returns {Object[]} — array of trigger objects: { type, data }
 */
export function detectTriggers(state, prevState) {
  const triggers = [];

  // ── Phase-based triggers ──────────────────────────────────────────────
  triggers.push(...detectPhaseTriggers(state, prevState));

  // ── Bidding triggers ──────────────────────────────────────────────────
  if (state.status === GAME_PHASE.BIDDING) {
    triggers.push(...detectBiddingTriggers(state, prevState));
  }

  // ── Play triggers ─────────────────────────────────────────────────────
  if (state.status === GAME_PHASE.PLAYING) {
    triggers.push(...detectPlayTriggers(state, prevState));
    triggers.push(...detectStrategicTriggers(state, prevState));
  }

  // ── Round end triggers ────────────────────────────────────────────────
  if (state.status === GAME_PHASE.ROUND_END) {
    triggers.push(...detectRoundEndTriggers(state, prevState));
  }

  // ── Game over ─────────────────────────────────────────────────────────
  if (state.status === GAME_PHASE.GAME_OVER) {
    triggers.push(...detectGameOverTriggers(state));
  }

  return triggers;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE TRIGGERS
// ═════════════════════════════════════════════════════════════════════════════

function detectPhaseTriggers(state, prevState) {
  const triggers = [];

  // Bidding just started (phase changed to BIDDING)
  if (state.status === GAME_PHASE.BIDDING &&
      prevState?.status !== GAME_PHASE.BIDDING) {
    triggers.push({
      type: TRIGGER.BIDDING_START,
      data: {
        round: state.current_round,
        humanHand: state.hands[HUMAN_SEAT],
        mode: state.mode,
      },
    });
  }

  return triggers;
}

// ═════════════════════════════════════════════════════════════════════════════
// BIDDING TRIGGERS
// ═════════════════════════════════════════════════════════════════════════════

function detectBiddingTriggers(state, prevState) {
  const triggers = [];
  if (!prevState) return triggers;

  const partner = SEAT_PARTNER[HUMAN_SEAT]; // 'north'

  // Check each seat for a new bid
  for (const seat of PLAYER_SEATS) {
    const hadBid = prevState.bids[seat] !== null;
    const hasBid = state.bids[seat] !== null;

    if (!hadBid && hasBid) {
      const bid = state.bids[seat];

      // Nil detection (any seat)
      if (bid === BID_NIL) {
        triggers.push({
          type: TRIGGER.NIL_BID_DETECTED,
          data: { seat, isPartner: seat === partner, isHuman: seat === HUMAN_SEAT },
        });
      }

      // Partner bid
      if (seat === partner) {
        triggers.push({
          type: TRIGGER.PARTNER_BID_PLACED,
          data: { seat, bid },
        });
      }

      // Opponent bid
      if (seat !== HUMAN_SEAT && seat !== partner) {
        triggers.push({
          type: TRIGGER.OPPONENT_BID_PLACED,
          data: { seat, bid },
        });
      }
    }
  }

  // All bids in?
  const allBidsIn = PLAYER_SEATS.every(s => state.bids[s] !== null);
  const prevAllBidsIn = prevState ? PLAYER_SEATS.every(s => prevState.bids[s] !== null) : false;

  if (allBidsIn && !prevAllBidsIn) {
    const teamBid = (state.bids[HUMAN_SEAT] || 0) + (state.bids[partner] || 0);
    const opponentBid = (state.bids['east'] || 0) + (state.bids['west'] || 0);

    triggers.push({
      type: TRIGGER.ALL_BIDS_IN,
      data: {
        bids: { ...state.bids },
        teamBid,
        opponentBid,
        totalBid: teamBid + opponentBid,
      },
    });
  }

  return triggers;
}

// ═════════════════════════════════════════════════════════════════════════════
// PLAY TRIGGERS — Card-level events
// ═════════════════════════════════════════════════════════════════════════════

function detectPlayTriggers(state, prevState) {
  const triggers = [];
  if (!prevState) return triggers;

  // ── It's the human's turn ─────────────────────────────────────────────
  if (state.current_turn === HUMAN_SEAT &&
      prevState.current_turn !== HUMAN_SEAT) {
    triggers.push({
      type: TRIGGER.HUMAN_TURN,
      data: {
        trickNumber: state.current_trick,
        isLeading: state.current_trick_plays.length === 0,
        cardsInTrick: state.current_trick_plays.length,
      },
    });
  }

  // ── A trick just completed ────────────────────────────────────────────
  if (state.completed_tricks.length > (prevState.completed_tricks?.length || 0)) {
    const lastTrick = state.completed_tricks[state.completed_tricks.length - 1];
    triggers.push({
      type: TRIGGER.TRICK_COMPLETE,
      data: {
        trickNumber: lastTrick.trick_number,
        winner: lastTrick.winner,
        winningCard: lastTrick.winning_card,
        isHumanWin: lastTrick.winner === HUMAN_SEAT,
        isPartnerWin: lastTrick.winner === SEAT_PARTNER[HUMAN_SEAT],
        isTeamWin: SEAT_TO_PARTNERSHIP[lastTrick.winner] === 'northSouth',
      },
    });
  }

  // ── Spades just broken ────────────────────────────────────────────────
  if (state.spades_broken && !prevState.spades_broken) {
    // Find who broke spades — the last play that was a spade
    const breaker = findSpadesBreaker(state);
    triggers.push({
      type: TRIGGER.SPADES_BROKEN,
      data: {
        brokenBy: breaker?.seat || 'unknown',
        trickNumber: state.current_trick,
      },
    });
  }

  // ── Big spade played ──────────────────────────────────────────────────
  const lastPlay = getLastPlay(state, prevState);
  if (lastPlay && lastPlay.card.suit === 'spades' && [14, 13, 12].includes(lastPlay.card.rank)) {
    triggers.push({
      type: TRIGGER.BIG_SPADE_PLAYED,
      data: {
        seat: lastPlay.seat,
        card: lastPlay.card,
        isHuman: lastPlay.seat === HUMAN_SEAT,
        spadesRemaining: spadesRemaining(buildKnowledge(state)),
      },
    });
  }

  return triggers;
}

// ═════════════════════════════════════════════════════════════════════════════
// STRATEGIC TRIGGERS — Bigger-picture game situations
// ═════════════════════════════════════════════════════════════════════════════

function detectStrategicTriggers(state, prevState) {
  const triggers = [];
  if (!prevState) return triggers;

  const partner = SEAT_PARTNER[HUMAN_SEAT];
  const knowledge = buildKnowledge(state);
  const prevKnowledge = buildKnowledge(prevState);

  // ── Nil in danger ─────────────────────────────────────────────────────
  // Check if any active nil bidder is in a risky situation
  for (const seat of PLAYER_SEATS) {
    if (state.nil_status[seat] === NIL_STATUS.ACTIVE) {
      // Nil bidder is leading a trick — that's risky
      if (state.current_turn === seat && state.current_trick_plays.length === 0) {
        triggers.push({
          type: TRIGGER.NIL_IN_DANGER,
          data: {
            seat,
            isHuman: seat === HUMAN_SEAT,
            isPartner: seat === partner,
            reason: 'leading_trick',
            trickNumber: state.current_trick,
          },
        });
      }
    }

    // Nil just failed
    if (state.nil_status[seat] === NIL_STATUS.FAILED &&
        prevState.nil_status[seat] === NIL_STATUS.ACTIVE) {
      triggers.push({
        type: TRIGGER.NIL_FAILED,
        data: {
          seat,
          isHuman: seat === HUMAN_SEAT,
          isPartner: seat === partner,
          trickNumber: state.current_trick,
        },
      });
    }
  }

  // ── Overbid risk ──────────────────────────────────────────────────────
  // Team needs more tricks than they've won, and time is running out
  const teamTricksWon = state.tricks_won[HUMAN_SEAT] + state.tricks_won[partner];
  const teamBid = (state.bids[HUMAN_SEAT] || 0) + (state.bids[partner] || 0);
  const tricksLeft = MAX_TRICKS_PER_HAND - state.current_trick + 1;
  const tricksNeeded = teamBid - teamTricksWon;

  if (tricksNeeded > 0 && tricksLeft <= tricksNeeded + 1 && state.current_trick >= 8) {
    triggers.push({
      type: TRIGGER.OVERBID_RISK,
      data: {
        teamBid,
        teamTricksWon,
        tricksNeeded,
        tricksLeft,
        trickNumber: state.current_trick,
      },
    });
  }

  // ── Underbid risk (bags piling up) ────────────────────────────────────
  const extraTricks = teamTricksWon - teamBid;
  if (extraTricks >= 2 && teamBid > 0 && state.current_trick >= 6) {
    triggers.push({
      type: TRIGGER.UNDERBID_RISK,
      data: {
        teamBid,
        teamTricksWon,
        extraTricks,
        trickNumber: state.current_trick,
      },
    });
  }

  // ── Bag warning ───────────────────────────────────────────────────────
  // If current bags + projected overtricks would hit 10
  const currentBags = state.scores.north_south.bags;
  const projectedBags = currentBags + Math.max(0, extraTricks);
  if (projectedBags >= 8 && currentBags < 10) {
    triggers.push({
      type: TRIGGER.BAG_WARNING,
      data: {
        currentBags,
        projectedBags,
        teamBid,
        teamTricksWon,
      },
    });
  }

  // ── Void detection ────────────────────────────────────────────────────
  // Check if a NEW void was just discovered
  for (const seat of PLAYER_SEATS) {
    const prevVoids = prevKnowledge.known_voids[seat] || [];
    const currVoids = knowledge.known_voids[seat] || [];

    for (const suit of currVoids) {
      if (!prevVoids.includes(suit)) {
        const isPartner = seat === partner;
        const isOpponent = seat !== HUMAN_SEAT && seat !== partner;

        if (isOpponent) {
          triggers.push({
            type: TRIGGER.OPPONENT_VOID_DETECTED,
            data: { seat, suit, trickNumber: state.current_trick },
          });
        } else if (isPartner) {
          triggers.push({
            type: TRIGGER.PARTNER_VOID_DETECTED,
            data: { seat, suit, trickNumber: state.current_trick },
          });
        }
      }
    }
  }

  return triggers;
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUND END TRIGGERS
// ═════════════════════════════════════════════════════════════════════════════

function detectRoundEndTriggers(state, prevState) {
  const triggers = [];

  // Only fire once when we transition to ROUND_END
  if (prevState?.status === GAME_PHASE.ROUND_END) return triggers;

  triggers.push({
    type: TRIGGER.ROUND_COMPLETE,
    data: {
      round: state.current_round,
      scores: { ...state.scores },
      bids: { ...state.bids },
      tricksWon: { ...state.tricks_won },
    },
  });

  // Check for nil successes
  const partner = SEAT_PARTNER[HUMAN_SEAT];
  for (const seat of PLAYER_SEATS) {
    if (state.nil_status[seat] === NIL_STATUS.MADE) {
      triggers.push({
        type: TRIGGER.NIL_SUCCEEDED,
        data: {
          seat,
          isHuman: seat === HUMAN_SEAT,
          isPartner: seat === partner,
        },
      });
    }
  }

  return triggers;
}

// ═════════════════════════════════════════════════════════════════════════════
// GAME OVER TRIGGERS
// ═════════════════════════════════════════════════════════════════════════════

function detectGameOverTriggers(state) {
  const triggers = [];

  const nsScore = state.scores.north_south.total;
  const ewScore = state.scores.east_west.total;
  const humanWon = nsScore >= 500 || ewScore <= -200;

  triggers.push({
    type: TRIGGER.GAME_OVER,
    data: {
      humanWon,
      northSouthScore: nsScore,
      eastWestScore: ewScore,
      rounds: state.current_round,
    },
  });

  return triggers;
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Finds the card play that broke spades in the current trick.
 */
function findSpadesBreaker(state) {
  // Check current trick plays for the first spade
  for (const play of state.current_trick_plays) {
    if (play.card.suit === 'spades') {
      return play;
    }
  }
  // Check the last completed trick
  if (state.completed_tricks.length > 0) {
    const lastTrick = state.completed_tricks[state.completed_tricks.length - 1];
    for (const play of lastTrick.plays) {
      if (play.card.suit === 'spades') {
        return play;
      }
    }
  }
  return null;
}

/**
 * Gets the most recent card play by comparing current and previous state.
 */
function getLastPlay(state, prevState) {
  const currPlays = state.play_history || [];
  const prevPlays = prevState?.play_history || [];

  if (currPlays.length > prevPlays.length) {
    return currPlays[currPlays.length - 1];
  }
  return null;
}
