/**
 * coach/biddingTutor.js
 *
 * Ray's Bidding Expert — 6-Step Hand Evaluation + Nil Check
 *
 * When the human player looks at their 13 cards and needs to decide
 * how many tricks to bid, this module is Ray's brain working behind
 * the scenes. It evaluates the hand using a 6-step heuristic and
 * produces a recommended bid with a confidence level and full breakdown.
 *
 * The 6 steps:
 *   1. Spade strength (trump power)
 *   2. Side suit honors (Aces, Kings in non-trump suits)
 *   3. Ruffing power (voids + short suits with spade backup)
 *   4. Length tricks (long suits that can run)
 *   5. Risk adjustments (penalties for weak hands or bag danger)
 *   6. Partner considerations (adjust based on partner's bid)
 *
 * Before the 6 steps, it checks Nil eligibility.
 *
 * Rules for this file:
 *   - READ-ONLY access to game state. Never changes the Scoreboard.
 *   - No imports from ui or bots.
 *   - Pure functions — give it a hand and state, get back a recommendation.
 */

import {
  SUITS,
  HUMAN_SEAT,
  SEAT_PARTNER,
  BID_NIL,
} from '../engine/constants.js';

import {
  filterBySuit,
  groupBySuit,
  suitLengths,
} from '../engine/cardUtils.js';

// ═════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════

/** Rank values for reference */
const ACE = 14;
const KING = 13;
const QUEEN = 12;
const JACK = 11;

/** Non-trump suits */
const SIDE_SUITS = ['hearts', 'diamonds', 'clubs'];

// ═════════════════════════════════════════════════════════════════════════════
// MAIN: GET BID RECOMMENDATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Evaluates the human's hand and returns a bid recommendation.
 *
 * @param {Object} state — current GameState (must be in BIDDING phase)
 * @returns {Object} recommendation:
 *   {
 *     bid: number,               // recommended bid (0 = NIL, 1–13)
 *     confidence: string,        // 'high' | 'medium' | 'low'
 *     breakdown: {
 *       spadeScore: number,
 *       honorsScore: number,
 *       ruffingScore: number,
 *       lengthScore: number,
 *       riskAdjustment: number,
 *       partnerAdjustment: number,
 *       rawTotal: number,
 *       adjustedTotal: number,
 *     },
 *     sureTricks: number,        // tricks almost guaranteed
 *     possibleTricks: number,    // tricks that could go either way
 *     riskFactors: string[],     // plain-English risk warnings
 *     nilEligible: boolean,      // whether nil was considered viable
 *     nilReasons: string[],      // why nil was/wasn't recommended
 *     reasoning: string[],       // step-by-step reasoning for Ray to use
 *   }
 */
export function getBidRecommendation(state) {
  const hand = state.hands[HUMAN_SEAT];
  const partner = SEAT_PARTNER[HUMAN_SEAT];
  const partnerBid = state.bids[partner]; // null if partner hasn't bid yet

  // ── Group the hand by suit for analysis ────────────────────────────────
  const groups = groupBySuit(hand);
  const lengths = suitLengths(hand);
  const spades = groups.spades || [];
  const spadeRanks = spades.map(c => c.rank).sort((a, b) => b - a);

  // ── Check Nil eligibility first ────────────────────────────────────────
  const nilResult = checkNilEligibility(hand, spadeRanks, groups, lengths, partnerBid);

  if (nilResult.eligible && nilResult.recommend) {
    return {
      bid: BID_NIL,
      confidence: nilResult.confidence,
      breakdown: emptyBreakdown(),
      sureTricks: 0,
      possibleTricks: 0,
      riskFactors: nilResult.risks,
      nilEligible: true,
      nilReasons: nilResult.reasons,
      reasoning: nilResult.reasoning,
    };
  }

  // ── Run the 6-step heuristic ───────────────────────────────────────────
  const step1 = evaluateSpadeStrength(spadeRanks, lengths.spades);
  const step2 = evaluateSideSuitHonors(groups, lengths);
  const step3 = evaluateRuffingPower(groups, lengths);
  const step4 = evaluateLengthTricks(groups, lengths);
  const step5 = evaluateRiskAdjustments(hand, spadeRanks, groups, lengths, state);
  const step6 = evaluatePartnerConsiderations(partnerBid);

  const rawTotal = step1.score + step2.score + step3.score + step4.score;
  const adjustedTotal = rawTotal + step5.score + step6.score;

  // Floor at 1 (never recommend non-nil bid below 1)
  const recommendedBid = Math.max(1, Math.round(adjustedTotal));

  // Cap at 7 unless exceptional (per spec)
  const finalBid = (recommendedBid > 7 && step5.exceptional !== true)
    ? 7
    : Math.min(13, recommendedBid);

  // ── Calculate confidence ───────────────────────────────────────────────
  const sureTricks = step1.sureTricks + step2.sureTricks;
  const possibleTricks = Math.round(adjustedTotal) - sureTricks;
  const confidence = calculateConfidence(sureTricks, finalBid, step5.riskFactors);

  // ── Build reasoning trail ──────────────────────────────────────────────
  const reasoning = [
    ...step1.reasoning,
    ...step2.reasoning,
    ...step3.reasoning,
    ...step4.reasoning,
    ...step5.reasoning,
    ...step6.reasoning,
  ];

  return {
    bid: finalBid,
    confidence,
    breakdown: {
      spadeScore: step1.score,
      honorsScore: step2.score,
      ruffingScore: step3.score,
      lengthScore: step4.score,
      riskAdjustment: step5.score,
      partnerAdjustment: step6.score,
      rawTotal,
      adjustedTotal,
    },
    sureTricks,
    possibleTricks: Math.max(0, possibleTricks),
    riskFactors: step5.riskFactors,
    nilEligible: nilResult.eligible,
    nilReasons: nilResult.reasons,
    reasoning,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// NIL ELIGIBILITY CHECK
// ═════════════════════════════════════════════════════════════════════════════

function checkNilEligibility(hand, spadeRanks, groups, lengths, partnerBid) {
  const reasons = [];
  const risks = [];
  const reasoning = [];
  let eligible = true;

  // Check: No Aces or Kings in hand
  const hasAce = hand.some(c => c.rank === ACE);
  const hasKing = hand.some(c => c.rank === KING);

  if (hasAce) {
    eligible = false;
    reasons.push('Hand contains an Ace — too likely to win a trick');
  }
  if (hasKing) {
    // King is less of a dealbreaker if it's a singleton (can be led away from)
    const kingCards = hand.filter(c => c.rank === KING);
    const allKingsSingleton = kingCards.every(c => lengths[c.suit] === 1);
    if (!allKingsSingleton) {
      eligible = false;
      reasons.push('Hand contains a protected King — risky for nil');
    } else {
      risks.push('Singleton King — could survive but risky');
    }
  }

  // Check: No spades above rank 6
  const highSpade = spadeRanks.length > 0 ? spadeRanks[0] : 0;
  if (highSpade > 6) {
    eligible = false;
    reasons.push(`Highest spade is ${rankName(highSpade)} — too high for nil`);
  }

  // Check: Low accidental winner risk
  const queenCount = hand.filter(c => c.rank === QUEEN).length;
  if (queenCount >= 2) {
    risks.push('Multiple Queens increase accidental win risk');
  }

  // Check: No dangerous unprotected honors
  for (const suit of SIDE_SUITS) {
    const cards = groups[suit] || [];
    if (cards.length === 0) continue;
    const suitRanks = cards.map(c => c.rank).sort((a, b) => b - a);
    // Queen alone in a suit is dangerous
    if (suitRanks[0] === QUEEN && cards.length <= 2) {
      risks.push(`${suitName(suit)}: Queen with thin cover`);
    }
  }

  // Partner context
  const recommend = eligible && risks.length <= 1;
  const confidence = eligible && risks.length === 0 ? 'high' : 'medium';

  if (eligible) {
    reasoning.push('Your hand is weak enough to consider going nil');
    if (partnerBid !== null && partnerBid >= 4) {
      reasoning.push(`Your partner bid ${partnerBid} — they can carry the load`);
    }
    if (risks.length > 0) {
      reasoning.push(`Watch out: ${risks.join('; ')}`);
    }
  } else {
    reasoning.push('Nil is off the table here');
    reasons.forEach(r => reasoning.push(`  → ${r}`));
  }

  return { eligible, recommend, confidence, reasons, risks, reasoning };
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 1 — SPADE STRENGTH
// ═════════════════════════════════════════════════════════════════════════════

function evaluateSpadeStrength(spadeRanks, spadeCount) {
  let score = 0;
  let sureTricks = 0;
  const reasoning = [];

  if (spadeCount === 0) {
    score = -0.5;
    reasoning.push('No spades — can\'t cut, can\'t control trump');
    return { score, sureTricks, reasoning };
  }

  // Ace of spades
  if (spadeRanks.includes(ACE)) {
    score += 1.0;
    sureTricks += 1;
    reasoning.push('Ace of spades — that\'s a guaranteed trick');
  }

  // King of spades
  if (spadeRanks.includes(KING)) {
    score += 0.9;
    if (spadeRanks.includes(ACE)) {
      sureTricks += 1; // King is sure if you also have Ace
      reasoning.push('King of spades with the Ace — another sure one');
    } else {
      reasoning.push('King of spades — strong but the Ace is out there');
    }
  }

  // Queen of spades with support
  if (spadeRanks.includes(QUEEN)) {
    if (spadeCount >= 3) {
      score += 0.6;
      reasoning.push('Queen of spades with backup — solid');
    } else {
      score += 0.3;
      reasoning.push('Queen of spades but thin support — could get caught');
    }
  }

  // Jack or lower with 3+ spades
  if (!spadeRanks.includes(ACE) && !spadeRanks.includes(KING) && !spadeRanks.includes(QUEEN)) {
    if (spadeCount >= 3) {
      score += 0.3;
      reasoning.push('Low spades but you\'ve got length — might win one late');
    }
  }

  // Each spade beyond 4
  if (spadeCount > 4) {
    const bonus = (spadeCount - 4) * 0.2;
    score += bonus;
    reasoning.push(`${spadeCount} spades total — extra length adds power`);
  }

  return { score, sureTricks, reasoning };
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 2 — SIDE SUIT HONORS
// ═════════════════════════════════════════════════════════════════════════════

function evaluateSideSuitHonors(groups, lengths) {
  let score = 0;
  let sureTricks = 0;
  const reasoning = [];

  for (const suit of SIDE_SUITS) {
    const cards = groups[suit] || [];
    if (cards.length === 0) continue;

    const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
    const hasAce = ranks.includes(ACE);
    const hasKing = ranks.includes(KING);
    const hasQueen = ranks.includes(QUEEN);
    const name = suitName(suit);

    // Ace + King same suit = 1.9
    if (hasAce && hasKing) {
      score += 1.9;
      sureTricks += 2;
      reasoning.push(`${name}: Ace-King combo — two sure tricks`);
      continue; // Don't double-count
    }

    // Ace alone
    if (hasAce) {
      score += 1.0;
      sureTricks += 1;
      reasoning.push(`${name}: Ace — guaranteed trick`);
    }

    // King with support
    if (hasKing && !hasAce) {
      if (cards.length >= 2) {
        score += 0.7;
        reasoning.push(`${name}: King with cover — likely trick`);
      } else {
        score += 0.2;
        reasoning.push(`${name}: singleton King — might get caught by the Ace`);
      }
    }

    // Queen + King same suit (additional bonus)
    if (hasQueen && hasKing && !hasAce) {
      score += 0.2;
      reasoning.push(`${name}: Queen backing the King — extra support`);
    }
  }

  return { score, sureTricks, reasoning };
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 3 — RUFFING POWER
// ═════════════════════════════════════════════════════════════════════════════

function evaluateRuffingPower(groups, lengths) {
  let score = 0;
  const reasoning = [];
  const hasSpades = lengths.spades > 0;
  let voidCount = 0;

  for (const suit of SIDE_SUITS) {
    const count = lengths[suit] || 0;

    if (count === 0) {
      voidCount++;
      if (hasSpades) {
        score += 0.8;
        reasoning.push(`Void in ${suitName(suit)} with spades — you can cut every time`);
      } else {
        reasoning.push(`Void in ${suitName(suit)} but no spades to cut with`);
      }
    } else if (count === 1 && hasSpades) {
      score += 0.4;
      reasoning.push(`Singleton in ${suitName(suit)} — one round and you can start cutting`);
    }
  }

  // Cap: two voids max +1.0 total ruffing bonus (per spec)
  if (voidCount >= 2 && score > 1.0) {
    score = 1.0;
    reasoning.push('Multiple voids — capped the ruffing bonus');
  }

  return { score, reasoning };
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 4 — LENGTH TRICKS
// ═════════════════════════════════════════════════════════════════════════════

function evaluateLengthTricks(groups, lengths) {
  let score = 0;
  const reasoning = [];

  for (const suit of SIDE_SUITS) {
    const cards = groups[suit] || [];
    const count = cards.length;
    if (count < 5) continue;

    const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
    const hasHonor = ranks[0] >= JACK;
    const hasEntry = ranks.includes(ACE); // guaranteed entry
    const hasLikelyEntry = ranks.includes(KING); // probable entry
    const name = suitName(suit);

    if (!hasEntry && !hasLikelyEntry) {
      reasoning.push(`${name}: long suit (${count}) but no entry to run it`);
      continue; // Length without entry doesn't count per spec
    }

    if (count >= 7) {
      score += 1.5;
      reasoning.push(`${name}: 7+ cards — this suit can run for days`);
    } else if (count === 6) {
      score += 1.2;
      reasoning.push(`${name}: 6-card suit — late-round power`);
    } else if (count === 5 && hasHonor) {
      score += 0.8;
      reasoning.push(`${name}: 5 cards with an honor — potential runner`);
    } else if (count === 5) {
      score += 0.5;
      reasoning.push(`${name}: 5 cards, no honors — might get one length trick`);
    }
  }

  return { score, reasoning };
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 5 — RISK ADJUSTMENTS
// ═════════════════════════════════════════════════════════════════════════════

function evaluateRiskAdjustments(hand, spadeRanks, groups, lengths, state) {
  let score = 0;
  const riskFactors = [];
  const reasoning = [];
  let exceptional = false;

  // No Ace, no void, no long suit
  const hasAnyAce = hand.some(c => c.rank === ACE);
  const hasVoid = SIDE_SUITS.some(s => (lengths[s] || 0) === 0);
  const hasLongSuit = SIDE_SUITS.some(s => (lengths[s] || 0) >= 5);

  if (!hasAnyAce && !hasVoid && !hasLongSuit) {
    score -= 0.5;
    riskFactors.push('No aces, no voids, no long suits — hand lacks power');
    reasoning.push('This hand doesn\'t have a strong anchor anywhere');
  }

  // All honors unprotected (honors without supporting cards)
  const unprotectedHonors = hand.filter(c =>
    c.rank >= JACK && c.suit !== 'spades' && (lengths[c.suit] || 0) <= 1
  );
  if (unprotectedHonors.length >= 3) {
    score -= 0.5;
    riskFactors.push('Multiple unprotected honors — could get picked off');
    reasoning.push('Several high cards sitting alone in their suits — vulnerable');
  }

  // 4+ spades all below Jack
  if (lengths.spades >= 4 && spadeRanks.every(r => r < JACK)) {
    score -= 0.3;
    riskFactors.push('Many low spades — trump length without trump power');
    reasoning.push('Lots of small spades — they take up space but won\'t win much');
  }

  // Bag-sensitive adjustments
  const teamBags = state.scores?.north_south?.bags || 0;
  if (teamBags >= 9) {
    score -= 2;
    riskFactors.push('9 bags — one more overtrick triggers the penalty');
    reasoning.push('You\'re at 9 bags — bid conservatively or you\'ll lose 100 points');
  } else if (teamBags >= 7) {
    score -= 1;
    riskFactors.push('7-8 bags — bag penalty approaching');
    reasoning.push('Bags are piling up — don\'t overbid');
  }

  // Exceptional hand check (allows bid above 7)
  const surePower = hand.filter(c => c.rank === ACE).length;
  if (surePower >= 3 && lengths.spades >= 3) {
    exceptional = true;
  }

  return { score, riskFactors, reasoning, exceptional };
}

// ═════════════════════════════════════════════════════════════════════════════
// STEP 6 — PARTNER CONSIDERATIONS
// ═════════════════════════════════════════════════════════════════════════════

function evaluatePartnerConsiderations(partnerBid) {
  let score = 0;
  const reasoning = [];

  if (partnerBid === null) {
    reasoning.push('Partner hasn\'t bid yet — no adjustment');
    return { score, reasoning };
  }

  if (partnerBid === BID_NIL) {
    score += 0.5;
    reasoning.push('Partner bid nil — you\'re carrying the contract alone, bid a little higher');
  } else if (partnerBid >= 4) {
    score -= 0.5;
    reasoning.push(`Partner bid ${partnerBid} — that\'s aggressive, ease off a bit`);
  } else if (partnerBid === 1) {
    reasoning.push('Partner bid 1 — neutral, no adjustment');
  } else {
    reasoning.push(`Partner bid ${partnerBid} — moderate, no major adjustment`);
  }

  return { score, reasoning };
}

// ═════════════════════════════════════════════════════════════════════════════
// CONFIDENCE CALCULATION
// ═════════════════════════════════════════════════════════════════════════════

function calculateConfidence(sureTricks, bid, riskFactors) {
  if (sureTricks >= bid && riskFactors.length <= 1) {
    return 'high';
  }
  if (sureTricks >= bid - 1 && riskFactors.length <= 1) {
    return 'medium';
  }
  return 'low';
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function emptyBreakdown() {
  return {
    spadeScore: 0, honorsScore: 0, ruffingScore: 0,
    lengthScore: 0, riskAdjustment: 0, partnerAdjustment: 0,
    rawTotal: 0, adjustedTotal: 0,
  };
}

function rankName(rank) {
  const names = { 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack' };
  return names[rank] || String(rank);
}

function suitName(suit) {
  const names = { spades: 'Spades', hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs' };
  return names[suit] || suit;
}
