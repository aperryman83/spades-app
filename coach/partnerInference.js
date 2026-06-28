/**
 * coach/partnerInference.js
 *
 * Uncle Ray's Partner Reader — 7 Rules for Deducing Partner's Hand
 *
 * At a real Spades table, the best players aren't just looking at
 * their own 13 cards — they're watching EVERYONE, especially their
 * partner. Every card your partner plays is a message. This module
 * is Ray's ability to "read" those messages and build a picture of
 * what your partner is probably holding.
 *
 * Think of it as Ray sitting next to you whispering:
 *   "Your partner just threw a low heart when they had a choice.
 *    That means hearts ain't their suit. They're saving power
 *    somewhere else."
 *
 * The 7 Inference Rules:
 *   1. VOID DETECTION — Partner can't follow suit → void in that suit
 *   2. SUIT EXHAUSTION — Partner played their last card in a suit
 *   3. STRENGTH SIGNAL — High card = strong, low card = weak
 *   4. TRUMP COUNT — Tracking how many spades partner has used
 *   5. BID TRACKING — Comparing bid to tricks won (on pace? struggling?)
 *   6. PROTECTION PLAY — Partner playing high to cover nil or take pressure off
 *   7. LEAD SIGNAL — What partner leads reveals their strongest suit
 *
 * Architecture rules:
 *   - READ-ONLY access to game state. Never changes the Scoreboard.
 *   - No imports from ui or bots.
 *   - Pure functions — give it state, get back inferences.
 *   - All inferences rebuilt from play_history each call (no hidden state).
 */

import {
  HUMAN_SEAT,
  SEAT_PARTNER,
  SUITS,
  NIL_STATUS,
} from '../engine/constants.js';

import { buildKnowledge } from './cardCounter.js';

// ═════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════

const PARTNER = SEAT_PARTNER[HUMAN_SEAT]; // 'north'

const ACE = 14;
const KING = 13;
const QUEEN = 12;
const JACK = 11;

/** Confidence levels for inferences */
const CONFIDENCE = {
  CERTAIN:  'certain',    // 100% sure (e.g., void detected)
  STRONG:   'strong',     // Very likely (multiple signals align)
  MODERATE: 'moderate',   // Probable but not guaranteed
  WEAK:     'weak',       // Possible, based on limited info
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN API — Get all inferences about partner's hand
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Analyzes the game history and returns everything Ray can infer
 * about the partner's hand.
 *
 * @param {Object} state — current GameState
 * @returns {Object} partnerRead:
 *   {
 *     voids: string[],              // suits partner is void in
 *     exhausted: string[],          // suits partner has run out of
 *     strongSuits: string[],        // suits partner appears strong in
 *     weakSuits: string[],          // suits partner appears weak in
 *     spadesUsed: number,           // how many spades partner has played
 *     estimatedSpadesLeft: number,  // estimated spades remaining
 *     bidPace: string,              // 'ahead' | 'on_pace' | 'behind'
 *     isProtecting: boolean,        // partner seems to be covering (nil, etc.)
 *     leadSuit: string|null,        // suit partner has led most — their strong suit
 *     inferences: Object[],         // array of all individual inferences
 *     summary: string,              // Ray-voiced summary of the read
 *   }
 */
export function getPartnerRead(state) {
  const inferences = [];
  const knowledge = buildKnowledge(state);

  // ── Run all 7 inference rules ──────────────────────────────────────────
  const voidResult = detectVoids(state, knowledge);
  const exhaustResult = detectExhaustion(state, knowledge);
  const strengthResult = analyzeStrengthSignals(state);
  const trumpResult = trackTrumpUsage(state);
  const bidResult = trackBidPace(state);
  const protectionResult = detectProtectionPlays(state);
  const leadResult = analyzeLeadSignals(state);

  // Collect all inferences
  inferences.push(...voidResult.inferences);
  inferences.push(...exhaustResult.inferences);
  inferences.push(...strengthResult.inferences);
  inferences.push(...trumpResult.inferences);
  inferences.push(...bidResult.inferences);
  inferences.push(...protectionResult.inferences);
  inferences.push(...leadResult.inferences);

  // ── Build the composite read ───────────────────────────────────────────
  const partnerRead = {
    voids: voidResult.voids,
    exhausted: exhaustResult.exhausted,
    strongSuits: strengthResult.strongSuits,
    weakSuits: strengthResult.weakSuits,
    spadesUsed: trumpResult.spadesUsed,
    estimatedSpadesLeft: trumpResult.estimatedLeft,
    bidPace: bidResult.pace,
    isProtecting: protectionResult.isProtecting,
    leadSuit: leadResult.primaryLead,
    inferences,
    summary: buildSummary(voidResult, strengthResult, trumpResult, bidResult, leadResult),
  };

  return partnerRead;
}

/**
 * Get just the inferences that are new since the last trick.
 * Useful for Ray's real-time commentary — only mention what just changed.
 *
 * @param {Object} state     — current GameState
 * @param {Object} prevState — previous GameState
 * @returns {Object[]}       — new inferences only
 */
export function getNewInferences(state, prevState) {
  const current = getPartnerRead(state);
  const previous = prevState ? getPartnerRead(prevState) : { inferences: [] };

  const prevIds = new Set(previous.inferences.map(i => i.id));
  return current.inferences.filter(i => !prevIds.has(i.id));
}

// ═════════════════════════════════════════════════════════════════════════════
// RULE 1 — VOID DETECTION
// Partner didn't follow suit = void in that suit (certain)
// ═════════════════════════════════════════════════════════════════════════════

function detectVoids(state, knowledge) {
  const voids = knowledge.known_voids[PARTNER] || [];
  const inferences = voids.map(suit => ({
    id: `void_${suit}`,
    rule: 'void_detection',
    suit,
    confidence: CONFIDENCE.CERTAIN,
    message: `Partner is void in ${suitName(suit)} — they can cut with spades when ${suitName(suit)} leads.`,
    rayLine: `Your partner is OUT of ${suitName(suit)}, motherfucka. That means next time it leads, they can drop a spade and steal it. Use that.`,
  }));

  return { voids, inferences };
}

// ═════════════════════════════════════════════════════════════════════════════
// RULE 2 — SUIT EXHAUSTION
// Track when partner's played count in a suit matches the total they were dealt
// ═════════════════════════════════════════════════════════════════════════════

function detectExhaustion(state, knowledge) {
  const exhausted = [];
  const inferences = [];

  // We know partner is exhausted in a suit if they're void AND
  // have played at least one card from that suit before going void
  const partnerPlays = getPartnerPlays(state);
  const playedSuits = {};

  for (const play of partnerPlays) {
    const suit = play.card.suit;
    playedSuits[suit] = (playedSuits[suit] || 0) + 1;
  }

  const voids = knowledge.known_voids[PARTNER] || [];
  for (const suit of voids) {
    if (playedSuits[suit] && playedSuits[suit] > 0) {
      exhausted.push(suit);
      inferences.push({
        id: `exhausted_${suit}`,
        rule: 'suit_exhaustion',
        suit,
        confidence: CONFIDENCE.CERTAIN,
        cardsPlayed: playedSuits[suit],
        message: `Partner played ${playedSuits[suit]} ${suitName(suit)} cards before running out — they started with a short suit.`,
        rayLine: playedSuits[suit] <= 2
          ? `Partner only had ${playedSuits[suit]} ${suitName(suit)}. Short suit from the start. That's why they're cutting now.`
          : `Partner ran through ${playedSuits[suit]} ${suitName(suit)} cards. They're done in that suit now.`,
      });
    }
  }

  return { exhausted, inferences };
}

// ═════════════════════════════════════════════════════════════════════════════
// RULE 3 — STRENGTH SIGNALS
// High card plays = strong in that suit. Low throws = weak or saving.
// ═════════════════════════════════════════════════════════════════════════════

function analyzeStrengthSignals(state) {
  const strongSuits = [];
  const weakSuits = [];
  const inferences = [];

  const partnerPlays = getPartnerPlays(state);
  const suitAnalysis = {};

  for (const play of partnerPlays) {
    const suit = play.card.suit;
    if (!suitAnalysis[suit]) {
      suitAnalysis[suit] = { highCards: 0, lowCards: 0, totalPlays: 0 };
    }
    suitAnalysis[suit].totalPlays += 1;

    if (play.card.rank >= JACK) {
      suitAnalysis[suit].highCards += 1;
    } else if (play.card.rank <= 7) {
      suitAnalysis[suit].lowCards += 1;
    }
  }

  for (const [suit, analysis] of Object.entries(suitAnalysis)) {
    if (analysis.totalPlays < 1) continue;

    // Strong signal: played 2+ high cards (J, Q, K, A) in a suit
    if (analysis.highCards >= 2) {
      strongSuits.push(suit);
      inferences.push({
        id: `strong_${suit}`,
        rule: 'strength_signal',
        suit,
        confidence: CONFIDENCE.STRONG,
        highCards: analysis.highCards,
        message: `Partner has played ${analysis.highCards} high cards in ${suitName(suit)} — they're strong there.`,
        rayLine: `Partner is LOADED in ${suitName(suit)}, motherfucka. They've been dropping power cards. Don't compete with them in that suit — let them run it.`,
      });
    }

    // Weak signal: only played low cards (7 or below) in a suit, 2+ plays
    if (analysis.lowCards >= 2 && analysis.highCards === 0) {
      weakSuits.push(suit);
      inferences.push({
        id: `weak_${suit}`,
        rule: 'strength_signal',
        suit,
        confidence: CONFIDENCE.MODERATE,
        lowCards: analysis.lowCards,
        message: `Partner has only played low cards in ${suitName(suit)} — they're weak there or saving high ones.`,
        rayLine: `Partner keeps throwing low ${suitName(suit)}. Either they're saving the good ones or they don't have any. Either way, don't count on them for ${suitName(suit)} tricks.`,
      });
    }
  }

  return { strongSuits, weakSuits, inferences };
}

// ═════════════════════════════════════════════════════════════════════════════
// RULE 4 — TRUMP COUNT
// Track how many spades partner has played to estimate what they have left
// ═════════════════════════════════════════════════════════════════════════════

function trackTrumpUsage(state) {
  const inferences = [];
  const partnerPlays = getPartnerPlays(state);

  let spadesUsed = 0;
  for (const play of partnerPlays) {
    if (play.card.suit === 'spades') {
      spadesUsed += 1;
    }
  }

  // Average spade holding is 3-4 cards (13 spades / 4 players)
  // If partner has used 3+, they're likely running low
  const estimatedLeft = Math.max(0, 3 - spadesUsed); // rough estimate

  if (spadesUsed >= 3) {
    inferences.push({
      id: `trump_low`,
      rule: 'trump_count',
      confidence: CONFIDENCE.MODERATE,
      spadesUsed,
      estimatedLeft,
      message: `Partner has played ${spadesUsed} spades — they may be running low on trump.`,
      rayLine: `Partner has used ${spadesUsed} spades already, motherfucka. They might not have many left. Don't count on them for late-round cuts.`,
    });
  }

  if (spadesUsed === 0 && state.current_trick >= 5) {
    inferences.push({
      id: `trump_hoarding`,
      rule: 'trump_count',
      confidence: CONFIDENCE.WEAK,
      spadesUsed: 0,
      message: `Partner hasn't played a single spade through ${state.current_trick} tricks — they might be holding trump for later.`,
      rayLine: `Your partner hasn't dropped a single spade yet, motherfucka. They're either saving them for something big or they ain't got any. Watch and see.`,
    });
  }

  return { spadesUsed, estimatedLeft, inferences };
}

// ═════════════════════════════════════════════════════════════════════════════
// RULE 5 — BID TRACKING
// Compare partner's bid to their tricks won so far
// ═════════════════════════════════════════════════════════════════════════════

function trackBidPace(state) {
  const inferences = [];
  const partnerBid = state.bids[PARTNER];
  const partnerTricksWon = state.tricks_won[PARTNER];
  const trickNumber = state.current_trick;

  if (partnerBid === null || partnerBid === 0) {
    return { pace: 'nil', inferences };
  }

  // Expected pace: partnerBid / 13 * tricks played so far
  const tricksPlayed = trickNumber - 1; // current trick hasn't resolved
  const expectedTricks = (partnerBid / 13) * tricksPlayed;
  const pace = partnerTricksWon >= expectedTricks + 1
    ? 'ahead'
    : partnerTricksWon <= expectedTricks - 1
      ? 'behind'
      : 'on_pace';

  if (pace === 'behind' && tricksPlayed >= 5) {
    inferences.push({
      id: `bid_behind`,
      rule: 'bid_tracking',
      confidence: CONFIDENCE.MODERATE,
      partnerBid,
      partnerTricksWon,
      tricksPlayed,
      message: `Partner bid ${partnerBid} but has only won ${partnerTricksWon} with ${13 - tricksPlayed} tricks left — they're behind pace.`,
      rayLine: `Your partner bid ${partnerBid} and only has ${partnerTricksWon} so far, motherfucka. They need help. If you can set them up with a lead in their strong suit, do it.`,
    });
  }

  if (pace === 'ahead' && tricksPlayed >= 5) {
    inferences.push({
      id: `bid_ahead`,
      rule: 'bid_tracking',
      confidence: CONFIDENCE.MODERATE,
      partnerBid,
      partnerTricksWon,
      tricksPlayed,
      message: `Partner bid ${partnerBid} and has ${partnerTricksWon} already — they're ahead of pace.`,
      rayLine: `Partner's ahead on their bid, motherfucka. They got this. Focus on YOUR tricks now and watch those damn bags.`,
    });
  }

  return { pace, inferences };
}

// ═════════════════════════════════════════════════════════════════════════════
// RULE 6 — PROTECTION PLAYS
// Detect when partner is playing abnormally high (covering nil, etc.)
// ═════════════════════════════════════════════════════════════════════════════

function detectProtectionPlays(state) {
  const inferences = [];
  let isProtecting = false;

  // Check if human has an active nil — partner should be covering
  const humanNil = state.nil_status[HUMAN_SEAT] === NIL_STATUS.ACTIVE;

  if (humanNil) {
    const partnerPlays = getPartnerPlays(state);
    let highPlays = 0;
    let totalPlays = 0;

    for (const play of partnerPlays) {
      totalPlays += 1;
      if (play.card.rank >= JACK) {
        highPlays += 1;
      }
    }

    // If partner is consistently playing high cards, they're protecting
    if (totalPlays >= 2 && highPlays / totalPlays >= 0.6) {
      isProtecting = true;
      inferences.push({
        id: `protecting_nil`,
        rule: 'protection_play',
        confidence: CONFIDENCE.STRONG,
        highPlayRatio: highPlays / totalPlays,
        message: `Partner is playing abnormally high — they're covering your nil bid.`,
        rayLine: `Your partner's throwing power cards to protect your nil, motherfucka. They're doing their job. Make sure you do yours — play the damn BOTTOM.`,
      });
    }
  }

  // Check if partner has active nil — detect if they're dumping low
  const partnerNil = state.nil_status[PARTNER] === NIL_STATUS.ACTIVE;
  if (partnerNil) {
    const partnerPlays = getPartnerPlays(state);
    let lowPlays = 0;

    for (const play of partnerPlays) {
      if (play.card.rank <= 7) lowPlays += 1;
    }

    if (partnerPlays.length >= 2 && lowPlays === partnerPlays.length) {
      inferences.push({
        id: `partner_nil_hiding`,
        rule: 'protection_play',
        confidence: CONFIDENCE.STRONG,
        message: `Partner is playing exclusively low cards — protecting their nil successfully.`,
        rayLine: `Partner's hiding well on their nil, motherfucka. All low cards. Keep covering them — play HIGH to eat tricks they can't.`,
      });
    }
  }

  return { isProtecting, inferences };
}

// ═════════════════════════════════════════════════════════════════════════════
// RULE 7 — LEAD SIGNALS
// What suit partner leads most = their strongest suit
// ═════════════════════════════════════════════════════════════════════════════

function analyzeLeadSignals(state) {
  const inferences = [];
  const completedTricks = state.completed_tricks || [];
  const leadCounts = {};

  for (const trick of completedTricks) {
    const plays = trick.plays || [];
    if (plays.length === 0) continue;

    // Check if partner led this trick (first play)
    if (plays[0].seat === PARTNER) {
      const suit = plays[0].card.suit;
      leadCounts[suit] = (leadCounts[suit] || 0) + 1;
    }
  }

  // Find the suit they've led most
  let primaryLead = null;
  let maxLeads = 0;

  for (const [suit, count] of Object.entries(leadCounts)) {
    if (count > maxLeads) {
      maxLeads = count;
      primaryLead = suit;
    }
  }

  if (primaryLead && maxLeads >= 2) {
    inferences.push({
      id: `lead_signal_${primaryLead}`,
      rule: 'lead_signal',
      suit: primaryLead,
      confidence: CONFIDENCE.STRONG,
      leadCount: maxLeads,
      message: `Partner has led ${suitName(primaryLead)} ${maxLeads} times — that's their power suit.`,
      rayLine: `Your partner keeps leading ${suitName(primaryLead)}, motherfucka. That's where their power is. Don't fight them for that suit — let them run it and you handle the rest.`,
    });
  }

  // Secondary signal: what suit they AVOID leading
  const allSuits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const unleadSuits = allSuits.filter(s => !leadCounts[s] && s !== 'spades');
  // Only if they've had opportunities to lead (won tricks)
  const totalLeads = Object.values(leadCounts).reduce((a, b) => a + b, 0);

  if (totalLeads >= 3 && unleadSuits.length > 0) {
    for (const suit of unleadSuits) {
      inferences.push({
        id: `avoid_lead_${suit}`,
        rule: 'lead_signal',
        suit,
        confidence: CONFIDENCE.WEAK,
        message: `Partner has never led ${suitName(suit)} despite leading ${totalLeads} times — they may be weak there.`,
        rayLine: `Notice your partner hasn't led ${suitName(suit)} once. They probably don't have much there. Don't expect help from them in that suit.`,
      });
    }
  }

  return { primaryLead, inferences };
}

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY BUILDER — Ray's verbal read of the partner
// ═════════════════════════════════════════════════════════════════════════════

function buildSummary(voidResult, strengthResult, trumpResult, bidResult, leadResult) {
  const parts = [];

  // Voids
  if (voidResult.voids.length > 0) {
    const voidNames = voidResult.voids.map(suitName).join(' and ');
    parts.push(`void in ${voidNames}`);
  }

  // Strong suit
  if (leadResult.primaryLead) {
    parts.push(`strong in ${suitName(leadResult.primaryLead)}`);
  } else if (strengthResult.strongSuits.length > 0) {
    parts.push(`strong in ${suitName(strengthResult.strongSuits[0])}`);
  }

  // Trump situation
  if (trumpResult.spadesUsed >= 3) {
    parts.push(`running low on spades`);
  } else if (trumpResult.spadesUsed === 0) {
    parts.push(`hoarding spades`);
  }

  // Bid pace
  if (bidResult.pace === 'behind') {
    parts.push(`behind on their bid`);
  } else if (bidResult.pace === 'ahead') {
    parts.push(`ahead on their bid`);
  }

  if (parts.length === 0) {
    return `Not enough cards played yet to read your partner, motherfucka. Give it a few more tricks.`;
  }

  return `Here's what I'm seeing from your partner, motherfucka: ${parts.join(', ')}. Play to that.`;
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Gets all cards the partner has played this round.
 */
function getPartnerPlays(state) {
  const plays = [];

  // From completed tricks
  const completedTricks = state.completed_tricks || [];
  for (const trick of completedTricks) {
    for (const play of (trick.plays || [])) {
      if (play.seat === PARTNER) {
        plays.push(play);
      }
    }
  }

  // From current in-progress trick
  for (const play of (state.current_trick_plays || [])) {
    if (play.seat === PARTNER) {
      plays.push(play);
    }
  }

  return plays;
}

/**
 * Human-readable suit name.
 */
function suitName(suit) {
  const names = { spades: 'spades', hearts: 'hearts', diamonds: 'diamonds', clubs: 'clubs' };
  return names[suit] || suit;
}
