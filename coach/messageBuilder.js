/**
 * coach/messageBuilder.js
 *
 * Ray's Voice — Message Assembly + Voice Calibration
 *
 * This is where Uncle Ray becomes Uncle Ray. The other coach modules
 * figure out WHAT to say (bid advice, play recommendation, trigger
 * reaction). This module decides HOW to say it.
 *
 * It pulls voice knowledge from the Google Doc transcripts (via
 * voiceLoader.js), applies verbosity and intensity settings, and
 * assembles the final message that reaches the player.
 *
 * The voice knowledge (comedian transcripts) is the DNA.
 * The settings (verbosity/intensity) are the volume knob.
 * This module is the vocal cords.
 *
 * Rules for this file:
 *   - READ-ONLY access to game state
 *   - No imports from ui or bots
 *   - Loads voice knowledge once per session (cached)
 *   - All messages pass the "would a real uncle say this?" test
 */

import { loadVoiceKnowledge, isVoiceLoaded } from './voiceLoader.js';
import { TRIGGER } from './triggers.js';
import { getLine } from './lines.js';

// ═════════════════════════════════════════════════════════════════════════════
// VOICE SYSTEM PROMPT — The core instructions for Ray's voice
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Builds the system prompt that defines Uncle Ray's voice.
 * Combines the static voice rules with the dynamic transcript
 * knowledge from the Google Doc.
 *
 * @param {string} voiceKnowledge — transcript text from voiceLoader
 * @returns {string} — full voice system prompt
 */
function buildVoiceSystemPrompt(voiceKnowledge) {
  return `
You are Uncle Ray, a Spades teacher. You learned this game at kitchen tables, cookouts, and family reunions. You've been playing longer than most people been alive. You teach because you love the game and you love seeing people get better at it.

Your voice and cultural register are pulled directly from the following transcripts. Read the register and speak from it — do not summarize, do not clean it up, absorb it.

--- VOICE REFERENCE ---
${voiceKnowledge}
--- END VOICE REFERENCE ---

VOICE RULES (non-negotiable):
- No "Baby" — that is auntie energy, not uncle energy
- Emphasis carries the weight: "you BEEN knew better" not "you knew better"
- Don't announce you're about to say something. Just say it.
- When disappointed, get quieter and more specific. Not louder.
- Economy of words. 1-2 lines during play. Save the stories for between rounds.
- "We" not "you" — partnership framing. You're on their team.
- Rhetorical questions > direct statements for teaching.
- The lesson lives inside the observation.
- Confidence without arrogance. Warmth without softness.
- Would a real uncle who loves you say this? That is the test.

THINGS RAY NEVER DOES:
- Never uses "Baby," "Sweetie," "Honey" — that is not his register
- Never mocks the player as a person — only the play
- Never implies they should quit
- Never gets louder when disappointed — he gets quieter and more specific
- Never uses slurs, coded or otherwise
- Never uses setup words like "See," "Alright look," "Now then" — just speak
- If the player is frustrated, Ray gets calm. Never matches their energy up.
`.trim();
}

// ═════════════════════════════════════════════════════════════════════════════
// VERBOSITY & INTENSITY FILTERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Verbosity levels determine WHEN Ray speaks.
 *
 * 0 = Silent — Ray says nothing
 * 1 = Quiet — only on mistakes and nil danger
 * 2 = Normal — standard tips and reactions (DEFAULT)
 * 3 = Chatty — more situations, more flavor
 * 4 = Full — every trick gets a comment, longer explanations
 */
const VERBOSITY_RULES = {
  0: { speakOn: [] }, // silent
  1: { speakOn: ['mistake', 'nil_danger', 'nil_failed'] },
  2: { speakOn: ['mistake', 'nil_danger', 'nil_failed', 'bid_advice', 'play_advice', 'trick_win', 'spades_broken', 'round_end'] },
  3: { speakOn: ['mistake', 'nil_danger', 'nil_failed', 'bid_advice', 'play_advice', 'trick_win', 'trick_loss', 'spades_broken', 'round_end', 'bag_warning', 'void_detected', 'big_spade'] },
  4: { speakOn: ['all'] }, // everything
};

/**
 * Intensity levels determine HOW Ray sounds.
 *
 * 0 = Calm — no trash talk, no hype, just information
 * 1 = Warm — friendly, light humor
 * 2 = Classic — full Ray voice, stories and reactions (DEFAULT)
 * 3 = Extra — more reactions, more personality, more flavor
 */
const INTENSITY_LABELS = {
  0: 'calm',
  1: 'warm',
  2: 'classic',
  3: 'extra',
};

// ═════════════════════════════════════════════════════════════════════════════
// TRIGGER-TO-CATEGORY MAPPING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Maps trigger types to verbosity categories so we know
 * whether Ray should speak for a given event at a given verbosity.
 */
const TRIGGER_CATEGORY = {
  [TRIGGER.BIDDING_START]:          'bid_advice',
  [TRIGGER.PARTNER_BID_PLACED]:     'bid_advice',
  [TRIGGER.ALL_BIDS_IN]:            'bid_advice',
  [TRIGGER.HUMAN_TURN]:             'play_advice',
  [TRIGGER.TRICK_COMPLETE]:         'trick_win',
  [TRIGGER.SPADES_BROKEN]:          'spades_broken',
  [TRIGGER.NIL_IN_DANGER]:          'nil_danger',
  [TRIGGER.NIL_FAILED]:             'nil_failed',
  [TRIGGER.NIL_SUCCEEDED]:          'round_end',
  [TRIGGER.OVERBID_RISK]:           'mistake',
  [TRIGGER.UNDERBID_RISK]:          'bag_warning',
  [TRIGGER.BAG_WARNING]:            'bag_warning',
  [TRIGGER.BIG_SPADE_PLAYED]:       'big_spade',
  [TRIGGER.OPPONENT_VOID_DETECTED]: 'void_detected',
  [TRIGGER.PARTNER_VOID_DETECTED]:  'void_detected',
  [TRIGGER.ROUND_COMPLETE]:         'round_end',
  [TRIGGER.GAME_OVER]:              'round_end',
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN: BUILD MESSAGE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Assembles a complete coach message for a given trigger and context.
 *
 * @param {Object} params
 * @param {string} params.triggerType    — from TRIGGER enum
 * @param {Object} params.triggerData    — data from triggers.js
 * @param {Object} params.recommendation — from biddingTutor or playAdvisor (optional)
 * @param {Object} params.state          — current GameState
 * @param {Object} [params.options]      — { apiKey } for voice doc fetch
 * @returns {Promise<Object|null>} — message object or null if Ray stays quiet
 *   {
 *     text: string,           // Ray's spoken line
 *     whyText: string|null,   // deeper explanation (shown on "Why?" tap)
 *     displayType: string,    // 'bubble' | 'card' | 'overlay'
 *     recommendedCard: Card|null, // card to highlight (play phase only)
 *     intensity: string,      // 'calm' | 'warm' | 'classic' | 'extra'
 *     voiceLoaded: boolean,   // whether transcript knowledge was available
 *   }
 */
export async function buildMessage(params) {
  const { triggerType, triggerData, recommendation, state, options = {} } = params;
  const { verbosity, intensity } = state.settings;

  // ── Verbosity gate: should Ray speak at all? ──────────────────────────
  if (verbosity === 0) return null;

  const category = TRIGGER_CATEGORY[triggerType];
  if (!category) return null;

  const allowed = VERBOSITY_RULES[verbosity]?.speakOn || [];
  if (!allowed.includes('all') && !allowed.includes(category)) {
    return null;
  }

  // ── Load voice knowledge (cached after first call) ────────────────────
  const voiceKnowledge = await loadVoiceKnowledge(options);
  const voiceLoaded = isVoiceLoaded();

  // ── Build the message content ─────────────────────────────────────────
  const message = assembleMessage(triggerType, triggerData, recommendation, state, intensity);

  if (!message) return null;

  return {
    ...message,
    intensity: INTENSITY_LABELS[intensity] || 'classic',
    voiceLoaded,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// MESSAGE ASSEMBLY — Route to the right builder
// ═════════════════════════════════════════════════════════════════════════════

function assembleMessage(triggerType, triggerData, recommendation, state, intensity) {
  switch (triggerType) {

    // ── Bidding phase ─────────────────────────────────────────────────────
    case TRIGGER.BIDDING_START:
      return buildBiddingStartMessage(triggerData, recommendation, state, intensity);

    case TRIGGER.ALL_BIDS_IN:
      return buildAllBidsInMessage(triggerData, state, intensity);

    // ── Play phase ────────────────────────────────────────────────────────
    case TRIGGER.HUMAN_TURN:
      return buildHumanTurnMessage(triggerData, recommendation, state, intensity);

    case TRIGGER.TRICK_COMPLETE:
      return buildTrickCompleteMessage(triggerData, state, intensity);

    case TRIGGER.SPADES_BROKEN:
      return buildSpadesBrokenMessage(triggerData, intensity);

    // ── Nil events ────────────────────────────────────────────────────────
    case TRIGGER.NIL_IN_DANGER:
      return buildNilDangerMessage(triggerData, intensity);

    case TRIGGER.NIL_FAILED:
      return buildNilFailedMessage(triggerData, intensity);

    // ── Strategic ─────────────────────────────────────────────────────────
    case TRIGGER.OVERBID_RISK:
      return buildOverbidMessage(triggerData, intensity);

    case TRIGGER.BAG_WARNING:
      return buildBagWarningMessage(triggerData, intensity);

    case TRIGGER.BIG_SPADE_PLAYED:
      return buildBigSpadeMessage(triggerData, intensity);

    // ── Round/Game end ────────────────────────────────────────────────────
    case TRIGGER.ROUND_COMPLETE:
      return buildRoundEndMessage(triggerData, state, intensity);

    case TRIGGER.GAME_OVER:
      return buildGameOverMessage(triggerData, intensity);

    default:
      return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MESSAGE BUILDERS — Each game moment gets its own builder
// ═════════════════════════════════════════════════════════════════════════════

function buildBiddingStartMessage(triggerData, recommendation, state, intensity) {
  const mode = state.mode;

  // Beginner: Socratic — ask questions first
  if (mode === 'beginner' && recommendation) {
    const rec = recommendation;

    // Choose confidence-appropriate flavor line
    let flavorCategory = 'BIDDING_QUESTION';
    if (rec.confidence >= 0.8) flavorCategory = 'BIDDING_CONFIDENT';
    else if (rec.confidence <= 0.4) flavorCategory = 'BIDDING_CAUTIOUS';
    if (rec.nilEligible) flavorCategory = 'BIDDING_NIL_POSSIBLE';

    return {
      text: getLine(flavorCategory) || getLine('BIDDING_QUESTION'),
      whyText: rec.reasoning.length > 0
        ? rec.reasoning.join(' ')
        : null,
      displayType: 'card',
      recommendedCard: null,
    };
  }

  // Medium: available on demand
  if (mode === 'medium' && recommendation) {
    return {
      text: getLine('BIDDING_NUDGE'),
      whyText: recommendation.reasoning.join(' '),
      displayType: 'bubble',
      recommendedCard: null,
    };
  }

  // Advanced: silent unless asked
  return null;
}

function buildAllBidsInMessage(triggerData, state, intensity) {
  const { teamBid, opponentBid, totalBid } = triggerData;

  if (totalBid > 13) {
    return {
      text: getLine('ALL_BIDS_OVERBID', { totalBid }),
      whyText: `Team bid: ${teamBid}. Opponents bid: ${opponentBid}. That's ${totalBid} on 13 tricks — somebody's getting set.`,
      displayType: 'bubble',
      recommendedCard: null,
    };
  }

  if (teamBid >= 8) {
    return {
      text: getLine('ALL_BIDS_STRONG', { teamBid }),
      whyText: null,
      displayType: 'bubble',
      recommendedCard: null,
    };
  }

  if (teamBid <= 4) {
    return {
      text: getLine('ALL_BIDS_LIGHT'),
      whyText: null,
      displayType: 'bubble',
      recommendedCard: null,
    };
  }

  return null;
}

function buildHumanTurnMessage(triggerData, recommendation, state, intensity) {
  if (!recommendation) return null;

  const rec = recommendation;
  const mode = state.mode;

  // Beginner: more guidance
  if (mode === 'beginner') {
    return {
      text: rec.reason,
      whyText: rec.deeperReason,
      displayType: 'bubble',
      recommendedCard: rec.card,
    };
  }

  // Medium: subtle nudge
  if (mode === 'medium') {
    return {
      text: rec.reason,
      whyText: rec.deeperReason,
      displayType: 'bubble',
      recommendedCard: rec.card,
    };
  }

  // Advanced: only on critical moments (nil, set danger)
  if (rec.priority <= 2) {
    return {
      text: rec.reason,
      whyText: rec.deeperReason,
      displayType: 'bubble',
      recommendedCard: rec.card,
    };
  }

  return null;
}

function buildTrickCompleteMessage(triggerData, state, intensity) {
  const { isTeamWin, winner, trickNumber } = triggerData;

  if (intensity <= 1) return null; // calm/warm: skip trick commentary

  if (isTeamWin) {
    // Use the "big" lines for clutch wins at intensity 2+
    const category = (intensity >= 2 && triggerData.wasCritical)
      ? 'TRICK_WIN_TEAM_BIG'
      : 'TRICK_WIN_TEAM';
    return {
      text: getLine(category),
      whyText: null,
      displayType: 'bubble',
      recommendedCard: null,
    };
  }

  // Team loss — only comment at higher intensity
  if (intensity >= 2) {
    const category = triggerData.wasCostly ? 'TRICK_LOSS_COSTLY' : 'TRICK_LOSS_TEAM';
    return {
      text: getLine(category),
      whyText: null,
      displayType: 'bubble',
      recommendedCard: null,
    };
  }

  return null;
}

function buildSpadesBrokenMessage(triggerData, intensity) {
  return {
    text: getLine('SPADES_BROKEN'),
    whyText: 'Once spades are broken, anyone can lead with trump. The game changes here.',
    displayType: 'bubble',
    recommendedCard: null,
  };
}

function buildNilDangerMessage(triggerData, intensity) {
  const category = triggerData.isHuman ? 'NIL_DANGER_HUMAN' : 'NIL_DANGER_PARTNER';

  return {
    text: getLine(category),
    whyText: 'A nil bidder leading a trick is dangerous — play the absolute lowest card possible.',
    displayType: 'bubble',
    recommendedCard: null,
  };
}

function buildNilFailedMessage(triggerData, intensity) {
  if (triggerData.isHuman) {
    return {
      text: getLine('NIL_FAILED_HUMAN'),
      whyText: 'Nil failure costs 100 points but the round keeps going. Focus on helping the team bid now.',
      displayType: 'bubble',
      recommendedCard: null,
    };
  }

  if (triggerData.isPartner) {
    return {
      text: getLine('NIL_FAILED_PARTNER'),
      whyText: null,
      displayType: 'bubble',
      recommendedCard: null,
    };
  }

  // Opponent nil failed
  return {
    text: getLine('NIL_FAILED_OPPONENT'),
    whyText: null,
    displayType: 'bubble',
    recommendedCard: null,
  };
}

function buildOverbidMessage(triggerData, intensity) {
  const { tricksNeeded, tricksLeft } = triggerData;

  return {
    text: getLine('OVERBID_RISK', { needed: tricksNeeded, left: tricksLeft }),
    whyText: 'Missing your bid costs bid × 10 points. Every trick from here matters.',
    displayType: 'bubble',
    recommendedCard: null,
  };
}

function buildBagWarningMessage(triggerData, intensity) {
  const { currentBags } = triggerData;

  if (currentBags >= 9) {
    return {
      text: getLine('BAG_WARNING_CRITICAL', { bags: currentBags }),
      whyText: 'At 10 bags the penalty fires: -100 points and bags reset. Play to lose tricks you don\'t need.',
      displayType: 'bubble',
      recommendedCard: null,
    };
  }

  return {
    text: getLine('BAG_WARNING_CAUTION', { bags: currentBags }),
    whyText: `Bag penalty hits at 10. We're at ${currentBags}. Be careful about overtricks.`,
    displayType: 'bubble',
    recommendedCard: null,
  };
}

function buildBigSpadeMessage(triggerData, intensity) {
  if (intensity < 2) return null;

  const rankNames = { 14: 'Ace', 13: 'King', 12: 'Queen' };
  const name = rankNames[triggerData.card.rank] || 'big spade';

  return {
    text: getLine('BIG_SPADE_PLAYED', { card: name, remaining: triggerData.spadesRemaining }),
    whyText: `${triggerData.spadesRemaining} spades left in play. Knowing which power cards are gone changes what you lead.`,
    displayType: 'bubble',
    recommendedCard: null,
  };
}

function buildRoundEndMessage(triggerData, state, intensity) {
  const nsScore = triggerData.scores?.north_south?.total ?? state.scores.north_south.total;
  const ewScore = triggerData.scores?.east_west?.total ?? state.scores.east_west.total;
  const diff = Math.abs(nsScore - ewScore);
  const ahead = nsScore > ewScore;

  // Check if team got set this round
  if (triggerData.teamWasSet) {
    return {
      text: getLine('ROUND_END_SET'),
      whyText: null,
      displayType: 'card',
      recommendedCard: null,
    };
  }

  if (triggerData.opponentWasSet) {
    return {
      text: getLine('ROUND_END_SET_OPPONENT'),
      whyText: null,
      displayType: 'card',
      recommendedCard: null,
    };
  }

  if (diff <= 30) {
    return {
      text: getLine('ROUND_END_CLOSE', { ourScore: nsScore, theirScore: ewScore }),
      whyText: null,
      displayType: 'card',
      recommendedCard: null,
    };
  }

  if (ahead) {
    return {
      text: getLine('ROUND_END_AHEAD', { ourScore: nsScore, theirScore: ewScore, lead: diff }),
      whyText: null,
      displayType: 'card',
      recommendedCard: null,
    };
  }

  return {
    text: getLine('ROUND_END_BEHIND', { ourScore: nsScore, theirScore: ewScore, deficit: diff }),
    whyText: null,
    displayType: 'card',
    recommendedCard: null,
  };
}

function buildGameOverMessage(triggerData, intensity) {
  if (triggerData.humanWon) {
    const category = triggerData.margin >= 200 ? 'GAME_OVER_BLOWOUT_WIN' : 'GAME_OVER_WIN';
    return {
      text: getLine(category),
      whyText: null,
      displayType: 'card',
      recommendedCard: null,
    };
  }

  const category = triggerData.margin >= 200 ? 'GAME_OVER_BLOWOUT_LOSS' : 'GAME_OVER_LOSS';
  return {
    text: getLine(category),
    whyText: null,
    displayType: 'card',
    recommendedCard: null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORTS — For building the system prompt externally
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns the full voice system prompt with loaded transcripts.
 * Can be used by an LLM integration layer or for debugging.
 *
 * @param {Object} [options] — { apiKey } for Google Docs API
 * @returns {Promise<string>}
 */
export async function buildRaySystemPrompt(options = {}) {
  const voiceKnowledge = await loadVoiceKnowledge(options);
  return buildVoiceSystemPrompt(voiceKnowledge);
}
