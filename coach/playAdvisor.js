/**
 * coach/playAdvisor.js
 *
 * Ray's Play Strategist — Priority Decision Tree
 *
 * When it's the human's turn to play a card, this module evaluates
 * the game situation and recommends the best card to play. It runs
 * through 9 priorities in strict order — the first priority that
 * has a strong opinion wins.
 *
 * Priority order:
 *   0. Legal move filter (start with what's allowed)
 *   1. Nil protection (protect your nil or your partner's nil)
 *   2. Setting the opponent (try to make them miss their bid)
 *   3. Making own bid (secure the tricks you need)
 *   4. Partner protection (help your partner's bid)
 *   5. Ducking / bag avoidance (don't win tricks you don't need)
 *   6. Drawing trump (flush out opponent spades)
 *   7. Endgame counting (tricks 8–13, precision play)
 *   8. General heuristics (fallback common sense)
 *
 * Rules for this file:
 *   - READ-ONLY access to game state. Never changes the Scoreboard.
 *   - No imports from ui or bots.
 *   - Uses cardUtils for all trump/rank checks (variant-ready).
 *   - Pure functions — give it state, get back a recommendation.
 */

import {
  HUMAN_SEAT,
  SEAT_PARTNER,
  SEAT_TO_PARTNERSHIP,
  NIL_STATUS,
  MAX_TRICKS_PER_HAND,
} from '../engine/constants.js';

import {
  filterBySuit,
  isTrumpCard,
  highestCard,
  lowestCard,
  compareCards,
  groupBySuit,
} from '../engine/cardUtils.js';

import { getLegalCards } from '../engine/legalMoves.js';

import { buildKnowledge, isPlayerVoid, highSpadesStillOut } from './cardCounter.js';

// ═════════════════════════════════════════════════════════════════════════════
// MAIN: GET PLAY RECOMMENDATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Evaluates the current game state and recommends a card for the human.
 *
 * @param {Object} state — current GameState (must be PLAYING phase, human's turn)
 * @returns {Object} recommendation:
 *   {
 *     card: Card,               // the recommended card to play
 *     priority: number,         // which priority level drove the decision (0–8)
 *     priorityName: string,     // human-readable name of the priority
 *     reason: string,           // one-line explanation for Ray
 *     deeperReason: string,     // more detailed "why" for the curious player
 *     alternateCard: Card|null, // second-best option (if close call)
 *   }
 */
export function getPlayRecommendation(state) {
  const hand = state.hands[HUMAN_SEAT];
  const trickPlays = state.current_trick_plays;
  const isLeading = trickPlays.length === 0;
  const ledSuit = isLeading ? null : trickPlays[0].card.suit;

  // Priority 0 — Get the legal cards
  const legalCards = getLegalCards(hand, ledSuit, isLeading, state);

  if (legalCards.length === 0) {
    return defaultRecommendation(hand[0], 'No legal cards found — this shouldn\'t happen');
  }

  // Only one legal card? No decision to make.
  if (legalCards.length === 1) {
    return {
      card: legalCards[0],
      priority: 0,
      priorityName: 'Only legal play',
      reason: 'Only one card you can play here',
      deeperReason: 'When you have no choice, there\'s nothing to think about — just play it',
      alternateCard: null,
    };
  }

  // Build context object for priority functions
  const partner = SEAT_PARTNER[HUMAN_SEAT];
  const knowledge = buildKnowledge(state);
  const ctx = {
    state,
    hand,
    legalCards,
    trickPlays,
    isLeading,
    ledSuit,
    partner,
    knowledge,
    trickNumber: state.current_trick,
    teamTricksWon: state.tricks_won[HUMAN_SEAT] + state.tricks_won[partner],
    teamBid: (state.bids[HUMAN_SEAT] || 0) + (state.bids[partner] || 0),
    humanBid: state.bids[HUMAN_SEAT] || 0,
    humanTricksWon: state.tricks_won[HUMAN_SEAT],
  };

  // Run priorities in order — first one with a strong opinion wins
  const priorities = [
    { fn: checkNilProtection, name: 'Nil protection', num: 1 },
    { fn: checkSettingOpponent, name: 'Setting the opponent', num: 2 },
    { fn: checkMakingOwnBid, name: 'Making own bid', num: 3 },
    { fn: checkPartnerProtection, name: 'Partner protection', num: 4 },
    { fn: checkDuckingBagAvoidance, name: 'Ducking / bag avoidance', num: 5 },
    { fn: checkDrawingTrump, name: 'Drawing trump', num: 6 },
    { fn: checkEndgameCounting, name: 'Endgame counting', num: 7 },
    { fn: checkGeneralHeuristics, name: 'General heuristics', num: 8 },
  ];

  for (const p of priorities) {
    const result = p.fn(ctx);
    if (result) {
      return {
        card: result.card,
        priority: p.num,
        priorityName: p.name,
        reason: result.reason,
        deeperReason: result.deeperReason,
        alternateCard: result.alternateCard || null,
      };
    }
  }

  // Absolute fallback — play the lowest legal card
  const fallback = lowestCard(legalCards, state);
  return defaultRecommendation(fallback, 'No strong preference — playing it safe with the low card');
}

// ═════════════════════════════════════════════════════════════════════════════
// PRIORITY 1 — NIL PROTECTION
// ═════════════════════════════════════════════════════════════════════════════

function checkNilProtection(ctx) {
  const { state, legalCards, partner, isLeading, trickPlays, ledSuit } = ctx;

  // Is the human bidding nil?
  const humanNil = state.nil_status[HUMAN_SEAT] === NIL_STATUS.ACTIVE;
  // Is partner bidding nil?
  const partnerNil = state.nil_status[partner] === NIL_STATUS.ACTIVE;

  if (!humanNil && !partnerNil) return null;

  // ── Human is nil: play the LOWEST legal card to avoid winning ─────────
  if (humanNil) {
    const lowest = lowestCard(legalCards, state);
    return {
      card: lowest,
      reason: 'You bid nil — play your lowest to avoid winning this trick',
      deeperReason: 'Every trick you take is a failed nil. Dump your lowest card no matter what.',
      alternateCard: null,
    };
  }

  // ── Partner is nil: help protect them ─────────────────────────────────
  if (partnerNil) {
    if (isLeading) {
      // Lead the highest card in a suit partner is NOT void in
      // Goal: win the trick yourself so partner doesn't have to
      const highest = highestCard(legalCards, state);
      return {
        card: highest,
        reason: 'Partner bid nil — lead strong to take the trick yourself',
        deeperReason: 'If you win the trick, your partner doesn\'t have to worry about accidentally taking it.',
      };
    }

    // Following: play high to overtake if partner is in danger
    if (trickPlays.some(p => p.seat === partner)) {
      const highest = highestCard(legalCards, state);
      return {
        card: highest,
        reason: 'Partner bid nil — play high to cover for them',
        deeperReason: 'Your partner needs you to take this trick so they don\'t accidentally win it.',
      };
    }
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// PRIORITY 2 — SETTING THE OPPONENT
// ═════════════════════════════════════════════════════════════════════════════

function checkSettingOpponent(ctx) {
  const { state, legalCards, trickPlays, isLeading, trickNumber } = ctx;

  // Only think about setting opponents if they're close to failing their bid
  const ewTricksWon = state.tricks_won.east + state.tricks_won.west;
  const ewBid = (state.bids.east || 0) + (state.bids.west || 0);
  const tricksLeft = MAX_TRICKS_PER_HAND - trickNumber + 1;
  const ewTricksNeeded = ewBid - ewTricksWon;

  // Opponents need more tricks than tricks remaining — they're already set
  if (ewTricksNeeded <= 0) return null;
  // Only activate when opponents are struggling
  if (ewTricksNeeded < tricksLeft - 2) return null;

  // If following, and an opponent is currently winning the trick, try to beat them
  if (!isLeading && trickPlays.length > 0) {
    const currentWinner = getCurrentTrickWinner(trickPlays, state);
    if (currentWinner && SEAT_TO_PARTNERSHIP[currentWinner.seat] === 'eastWest') {
      const beaters = legalCards.filter(c =>
        compareCards(c, currentWinner.card, state) > 0 ||
        (isTrumpCard(c, state) && !isTrumpCard(currentWinner.card, state))
      );
      if (beaters.length > 0) {
        // Use the lowest card that still beats them
        const best = lowestCard(beaters, state);
        return {
          card: best,
          reason: 'Opponents are struggling — steal this trick to set them',
          deeperReason: `East/West need ${ewTricksNeeded} more tricks with ${tricksLeft} left. Taking this one puts them in trouble.`,
        };
      }
    }
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// PRIORITY 3 — MAKING OWN BID
// ═════════════════════════════════════════════════════════════════════════════

function checkMakingOwnBid(ctx) {
  const { state, legalCards, isLeading, trickNumber, teamTricksWon, teamBid, trickPlays } = ctx;

  const tricksNeeded = teamBid - teamTricksWon;
  const tricksLeft = MAX_TRICKS_PER_HAND - trickNumber + 1;

  // Not urgent if we've already made our bid
  if (tricksNeeded <= 0) return null;

  // Getting tight — need to win now
  if (tricksNeeded >= tricksLeft - 1) {
    if (isLeading) {
      // Lead your strongest card — you need this trick
      const strongest = highestCard(legalCards, state);
      return {
        card: strongest,
        reason: 'We need tricks — lead your strongest card',
        deeperReason: `Team needs ${tricksNeeded} more tricks with only ${tricksLeft} left. Time to play power.`,
      };
    }

    // Following: play to win if you can
    const currentWinner = getCurrentTrickWinner(trickPlays, state);
    if (currentWinner) {
      const beaters = legalCards.filter(c =>
        canBeat(c, currentWinner.card, trickPlays[0].card.suit, state)
      );
      if (beaters.length > 0) {
        const cheapestWin = lowestCard(beaters, state);
        return {
          card: cheapestWin,
          reason: 'We need this trick — playing just enough to win it',
          deeperReason: `${tricksNeeded} tricks needed, ${tricksLeft} left. Win efficiently — don\'t waste high cards.`,
        };
      }
    }
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// PRIORITY 4 — PARTNER PROTECTION
// ═════════════════════════════════════════════════════════════════════════════

function checkPartnerProtection(ctx) {
  const { state, legalCards, trickPlays, partner, isLeading } = ctx;

  if (isLeading) return null;

  // If partner is currently winning the trick, don't overtake them
  const currentWinner = getCurrentTrickWinner(trickPlays, state);
  if (currentWinner && currentWinner.seat === partner) {
    // Partner's winning — play low to let them have it
    const lowest = lowestCard(legalCards, state);
    return {
      card: lowest,
      reason: 'Your partner is winning this trick — play low and let them have it',
      deeperReason: 'No reason to overtake your own partner. Save your high cards for later.',
    };
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// PRIORITY 5 — DUCKING / BAG AVOIDANCE
// ═════════════════════════════════════════════════════════════════════════════

function checkDuckingBagAvoidance(ctx) {
  const { state, legalCards, teamTricksWon, teamBid, isLeading } = ctx;

  // Have we already met our bid?
  const extraTricks = teamTricksWon - teamBid;
  if (extraTricks < 0) return null; // Still need tricks

  const teamBags = state.scores?.north_south?.bags || 0;
  const projectedBags = teamBags + extraTricks;

  // Bag danger — try to lose this trick
  if (projectedBags >= 7 || extraTricks >= 2) {
    const lowest = lowestCard(legalCards, state);

    if (isLeading) {
      // Lead low to try to lose the trick
      return {
        card: lowest,
        reason: 'We\'ve made our bid — lead low to avoid extra bags',
        deeperReason: `Already ${extraTricks} overtricks. ${teamBags} bags total. Every extra trick adds to the bag count.`,
      };
    } else {
      return {
        card: lowest,
        reason: 'We don\'t need this trick — duck to avoid bags',
        deeperReason: `Bid is made. Playing low to keep bags down. Currently at ${teamBags} bags.`,
      };
    }
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// PRIORITY 6 — DRAWING TRUMP
// ═════════════════════════════════════════════════════════════════════════════

function checkDrawingTrump(ctx) {
  const { state, legalCards, isLeading, knowledge, trickNumber, teamBid, teamTricksWon } = ctx;

  // Only consider drawing trump if we're leading
  if (!isLeading) return null;
  // Only if we still need tricks
  if (teamTricksWon >= teamBid) return null;
  // More relevant in early-mid game
  if (trickNumber > 9) return null;

  const trumpCards = legalCards.filter(c => isTrumpCard(c, state));
  if (trumpCards.length === 0) return null;

  // Do we have trump dominance? (high spades)
  const highTrumps = trumpCards.filter(c => c.rank >= 12); // Q, K, A
  if (highTrumps.length === 0) return null;

  // Are opponents likely still holding spades?
  const spadesOut = highSpadesStillOut(knowledge);
  if (spadesOut.length === 0 && knowledge.spades_played >= 10) return null; // Spades are mostly gone

  // Lead a high trump to flush out enemy spades
  const bestTrump = highestCard(highTrumps, state);
  return {
    card: bestTrump,
    reason: 'Lead a high spade to flush out the opponents\' trump',
    deeperReason: 'Drawing out their spades now means they can\'t cut you later when you lead side suits.',
    alternateCard: trumpCards.length > 1 ? lowestCard(trumpCards, state) : null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// PRIORITY 7 — ENDGAME COUNTING (Tricks 8–13)
// ═════════════════════════════════════════════════════════════════════════════

function checkEndgameCounting(ctx) {
  const { state, legalCards, isLeading, trickNumber, teamTricksWon, teamBid } = ctx;

  if (trickNumber < 8) return null;

  const tricksNeeded = teamBid - teamTricksWon;
  const tricksLeft = MAX_TRICKS_PER_HAND - trickNumber + 1;

  // Bid is made — play to lose
  if (tricksNeeded <= 0) {
    const lowest = lowestCard(legalCards, state);
    return {
      card: lowest,
      reason: 'Endgame — bid is made, play your lowest to shed bags',
      deeperReason: `Only ${tricksLeft} tricks left and the bid is made. Every extra trick is a bag.`,
    };
  }

  // Need exactly the right number of tricks — play precisely
  if (tricksNeeded === tricksLeft && isLeading) {
    // Must win every remaining trick
    const strongest = highestCard(legalCards, state);
    return {
      card: strongest,
      reason: 'Endgame — must win every trick from here to make the bid',
      deeperReason: `Need exactly ${tricksNeeded} from ${tricksLeft} remaining. No room for error.`,
    };
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// PRIORITY 8 — GENERAL HEURISTICS (Fallback)
// ═════════════════════════════════════════════════════════════════════════════

function checkGeneralHeuristics(ctx) {
  const { state, legalCards, isLeading, trickPlays, ledSuit } = ctx;

  if (isLeading) {
    // ── Leading heuristic: lead your strongest side suit ─────────────────
    const nonTrump = legalCards.filter(c => !isTrumpCard(c, state));
    if (nonTrump.length > 0) {
      // Find the suit where we have the best top card
      const groups = groupBySuit(nonTrump);
      let bestCard = null;
      let bestSuit = null;

      for (const [suit, cards] of Object.entries(groups)) {
        if (cards.length === 0) continue;
        const top = highestCard(cards, state);
        if (!bestCard || compareCards(top, bestCard, state) > 0) {
          bestCard = top;
          bestSuit = suit;
        }
      }

      if (bestCard) {
        return {
          card: bestCard,
          reason: `Lead with your strongest ${suitName(bestCard.suit)} card`,
          deeperReason: 'When no special situation applies, lead from your strongest suit to establish control.',
          alternateCard: nonTrump.length > 1 ? lowestCard(nonTrump, state) : null,
        };
      }
    }

    // Only trump left — lead lowest
    const lowest = lowestCard(legalCards, state);
    return {
      card: lowest,
      reason: 'Only spades left — lead low',
      deeperReason: 'Save your high spades for when you really need them.',
    };
  }

  // ── Following heuristic ─────────────────────────────────────────────────
  const currentWinner = getCurrentTrickWinner(trickPlays, state);

  if (currentWinner && SEAT_TO_PARTNERSHIP[currentWinner.seat] === 'northSouth') {
    // Team is winning — play low
    const lowest = lowestCard(legalCards, state);
    return {
      card: lowest,
      reason: 'Your team is winning this trick — play low',
      deeperReason: 'Don\'t waste a high card when your side already has it locked up.',
    };
  }

  // Opponent is winning — try to beat them cheaply
  if (currentWinner) {
    const beaters = legalCards.filter(c =>
      canBeat(c, currentWinner.card, trickPlays[0].card.suit, state)
    );
    if (beaters.length > 0) {
      const cheapest = lowestCard(beaters, state);
      return {
        card: cheapest,
        reason: 'Opponent is winning — beat them with your lowest winning card',
        deeperReason: 'Win it, but don\'t overspend. Save the big guns.',
        alternateCard: beaters.length > 1 ? highestCard(beaters, state) : null,
      };
    }
  }

  // Can't win — dump lowest
  const lowest = lowestCard(legalCards, state);
  return {
    card: lowest,
    reason: 'Can\'t win this trick — dump your lowest',
    deeperReason: 'When you can\'t win, minimize the damage by getting rid of a low card.',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Determines who is currently winning the in-progress trick.
 */
function getCurrentTrickWinner(trickPlays, state) {
  if (trickPlays.length === 0) return null;

  const ledSuit = trickPlays[0].card.suit;
  let winner = trickPlays[0];

  for (let i = 1; i < trickPlays.length; i++) {
    const play = trickPlays[i];

    // Trump beats non-trump
    const winnerIsTrump = isTrumpCard(winner.card, state);
    const playIsTrump = isTrumpCard(play.card, state);

    if (playIsTrump && !winnerIsTrump) {
      winner = play;
    } else if (playIsTrump && winnerIsTrump) {
      if (compareCards(play.card, winner.card, state) > 0) {
        winner = play;
      }
    } else if (!playIsTrump && !winnerIsTrump) {
      // Both non-trump: only the led suit can win
      if (play.card.suit === ledSuit && winner.card.suit === ledSuit) {
        if (compareCards(play.card, winner.card, state) > 0) {
          winner = play;
        }
      } else if (play.card.suit === ledSuit && winner.card.suit !== ledSuit) {
        winner = play; // led suit beats off-suit
      }
    }
  }

  return winner;
}

/**
 * Can cardA beat cardB given the led suit context?
 */
function canBeat(cardA, cardB, ledSuit, state) {
  const aIsTrump = isTrumpCard(cardA, state);
  const bIsTrump = isTrumpCard(cardB, state);

  // Trump beats non-trump
  if (aIsTrump && !bIsTrump) return true;
  if (!aIsTrump && bIsTrump) return false;

  // Both trump or both same suit: higher rank wins
  if (aIsTrump && bIsTrump) {
    return compareCards(cardA, cardB, state) > 0;
  }

  // Both non-trump: only matters if same suit as led
  if (cardA.suit === ledSuit && cardB.suit === ledSuit) {
    return compareCards(cardA, cardB, state) > 0;
  }

  // cardA is in led suit, cardB is not
  if (cardA.suit === ledSuit) return true;

  return false;
}

function defaultRecommendation(card, reason) {
  return {
    card,
    priority: 8,
    priorityName: 'Fallback',
    reason,
    deeperReason: '',
    alternateCard: null,
  };
}

function suitName(suit) {
  const names = { spades: 'Spades', hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs' };
  return names[suit] || suit;
}
