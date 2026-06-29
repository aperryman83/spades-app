/**
 * coach/coachState.js
 *
 * Uncle Ray's Conversational Brain — AI-Powered Edition
 *
 * Instead of pre-scripted conversation trees, Ray now has a real
 * AI brain powered by Claude Haiku. He can hold genuine back-and-forth
 * conversations, explain any concept the player asks about, and adapt
 * his teaching to the player's level.
 *
 * How it works:
 *   1. A teaching moment fires (from triggers.js)
 *   2. This module gathers game context (hand, bids, tricks, partner reads)
 *   3. Builds a system prompt (via rayPrompt.js) with Ray's personality + game state
 *   4. Sends it to the server API proxy → Claude Haiku
 *   5. Returns Ray's response to the UI
 *   6. Player types back → conversation continues until natural resolution
 *
 * Architecture rules:
 *   - READ-ONLY access to game state. Never changes the Scoreboard.
 *   - No imports from ui or bots.
 *   - Conversation history lives here, separate from game state.
 *   - Uses biddingTutor + playAdvisor + partnerInference for game analysis.
 *   - Uses rayPrompt.js for system prompt assembly.
 */
import { TRIGGER } from './triggers.js';
import { buildSystemPrompt, buildTeachingPrompt } from './rayPrompt.js';
import { getBidRecommendation } from './biddingTutor.js';
import { getPlayRecommendation } from './playAdvisor.js';
import { getPartnerRead } from './partnerInference.js';
import {
  HUMAN_SEAT,
  SEAT_PARTNER,
  GAME_PHASE,
  PLAYER_MODE,
  RANK_DISPLAY,
  SUIT_SYMBOL,
} from '../engine/constants.js';
import { cardLabel } from '../engine/cardUtils.js';
// ═════════════════════════════════════════════════════════════════════════════
// CONVERSATION STATE — Ray's notebook for the current dialogue
// ═════════════════════════════════════════════════════════════════════════════
let activeConversation = null;
let conversationCounter = 0;
// ═════════════════════════════════════════════════════════════════════════════
// TEACHING PRIORITY — Decides when Ray speaks up automatically
// ═════════════════════════════════════════════════════════════════════════════
const TRIGGER_PRIORITY = {
  [TRIGGER.NIL_FAILED]:           'HIGH',
  [TRIGGER.NIL_IN_DANGER]:        'HIGH',
  [TRIGGER.OVERBID_RISK]:         'HIGH',
  [TRIGGER.BAG_WARNING]:          'MEDIUM',
  [TRIGGER.BIDDING_START]:        'MEDIUM',
  [TRIGGER.TRICK_COMPLETE]:       'LOW',
  [TRIGGER.HUMAN_TURN]:           'LOW',
  [TRIGGER.SPADES_BROKEN]:        'LOW',
  [TRIGGER.PARTNER_VOID_DETECTED]:'MEDIUM',
  [TRIGGER.OPPONENT_VOID_DETECTED]:'LOW',
  [TRIGGER.ROUND_COMPLETE]:       'LOW',
};

function shouldAutoTeach(triggerType, state) {
  const priority = TRIGGER_PRIORITY[triggerType];
  if (!priority) return false;
  const verbosity = state.settings?.verbosity ?? 2;
  const mode = state.mode || PLAYER_MODE.BEGINNER;
  if (priority === 'HIGH') return verbosity >= 1;
  if (priority === 'MEDIUM') {
    if (mode === PLAYER_MODE.BEGINNER) return verbosity >= 2;
    return verbosity >= 3;
  }
  if (priority === 'LOW') {
    if (mode === PLAYER_MODE.BEGINNER) return verbosity >= 3;
    return verbosity >= 4;
  }
  return false;
}
// ═════════════════════════════════════════════════════════════════════════════
// GAME CONTEXT BUILDER
// ═════════════════════════════════════════════════════════════════════════════
function buildGameContext(state, triggerType, triggerData) {
  const context = {};
  context.phase = state.phase;
  const humanHand = state.hands?.[HUMAN_SEAT];
  if (humanHand && humanHand.length > 0) {
    context.hand = humanHand
      .map(c => `${RANK_DISPLAY[c.rank]}${SUIT_SYMBOL[c.suit]}`)
      .join(', ');
    const suitGroups = {};
    for (const card of humanHand) {
      const suitName = card.suit;
      const sym = SUIT_SYMBOL[suitName];
      if (!suitGroups[sym]) suitGroups[sym] = { count: 0, ranks: [], suit: suitName };
      suitGroups[sym].count++;
      suitGroups[sym].ranks.push(RANK_DISPLAY[card.rank]);
    }
    context.handBySuit = Object.values(suitGroups)
      .map(g => `${g.suit} (${g.count}): ${g.ranks.join(', ')}`)
      .join(' | ');
  }
  if (state.bids) {
    const bidEntries = Object.entries(state.bids)
      .filter(([_, b]) => b !== null && b !== undefined)
      .map(([seat, bid]) => {
        const label = seat === HUMAN_SEAT ? 'You' :
                      seat === SEAT_PARTNER[HUMAN_SEAT] ? 'Partner' :
                      `Opponent (${seat})`;
        return `${label}: ${bid === 0 ? 'Nil' : bid}`;
      });
    if (bidEntries.length > 0) context.bids = bidEntries.join(', ');
  }
  if (state.tricks_won) {
    const humanTeam = (state.tricks_won[HUMAN_SEAT] || 0) +
                      (state.tricks_won[SEAT_PARTNER[HUMAN_SEAT]] || 0);
    const oppTeam = Object.entries(state.tricks_won)
      .filter(([seat]) => seat !== HUMAN_SEAT && seat !== SEAT_PARTNER[HUMAN_SEAT])
      .reduce((sum, [_, t]) => sum + t, 0);
    context.tricksWon = humanTeam;
    context.opponentTricksWon = oppTeam;
    const teamBid = (state.bids?.[HUMAN_SEAT] || 0) +
                    (state.bids?.[SEAT_PARTNER[HUMAN_SEAT]] || 0);
    context.tricksNeeded = Math.max(0, teamBid - humanTeam);
  }
  if (state.phase === GAME_PHASE.PLAYING) {
    const trickPlays = state.current_trick || [];
    if (trickPlays.length === 0) {
      context.trickStatus = 'You are LEADING this trick — no cards have been played yet. You play first.';
    } else {
      const firstPlay = trickPlays[0];
      const ledSuit = firstPlay?.card?.suit;
      const ledBy = firstPlay?.seat === HUMAN_SEAT ? 'you' :
                    firstPlay?.seat === SEAT_PARTNER[HUMAN_SEAT] ? 'your partner' : 'an opponent';
      const cardsDown = trickPlays
        .map(p => {
          const who = p.seat === HUMAN_SEAT ? 'You' :
                      p.seat === SEAT_PARTNER[HUMAN_SEAT] ? 'Partner' : 'Opponent';
          return `${who}: ${RANK_DISPLAY[p.card.rank]}${SUIT_SYMBOL[p.card.suit]}`;
        })
        .join(', ');
      context.trickStatus = `This trick is already in progress — ${ledBy} led ${ledSuit}. Cards played so far: ${cardsDown}. You are FOLLOWING, not leading. You must play a ${ledSuit} if you have one.`;
    }
    if (trickPlays.length > 0) {
      context.currentTrick = trickPlays
        .map(play => {
          const label = play.seat === HUMAN_SEAT ? 'You' :
                        play.seat === SEAT_PARTNER[HUMAN_SEAT] ? 'Partner' : 'Opponent';
          return `${label}: ${RANK_DISPLAY[play.card.rank]}${SUIT_SYMBOL[play.card.suit]}`;
        })
        .join(', ');
    }
  }
  if (state.scores?.north_south?.bags !== undefined) context.bags = state.scores.north_south.bags;
  if (state.scores) {
    context.scores = {
      us: state.scores.north_south?.total ?? 0,
      them: state.scores.east_west?.total ?? 0,
    };
  }
  const humanNil = state.nil_status?.[HUMAN_SEAT];
  const partnerNil = state.nil_status?.[SEAT_PARTNER[HUMAN_SEAT]];
  if (humanNil) context.nilStatus = `You bid nil (status: ${humanNil})`;
  if (partnerNil) context.nilStatus = `Partner bid nil (status: ${partnerNil})`;
  if (state.phase === GAME_PHASE.BIDDING) {
    try {
      const rec = getBidRecommendation(state);
      if (rec) {
        context.bidRecommendation = `Suggested bid: ${rec.bid} (confidence: ${Math.round(rec.confidence * 100)}%). ` +
          `Sure tricks: ${rec.sureTricks}, Possible: ${rec.possibleTricks}. ` +
          (rec.nilEligible ? 'Nil is an option. ' : '') +
          (rec.reasoning?.length > 0 ? rec.reasoning.join(' ') : '');
      }
    } catch (e) {}
  }
  if (state.phase === GAME_PHASE.PLAYING && state.current_turn === HUMAN_SEAT) {
    try {
      const rec = getPlayRecommendation(state);
      if (rec) {
        context.playRecommendation = `Suggested play: ${RANK_DISPLAY[rec.card.rank]}${SUIT_SYMBOL[rec.card.suit]} ` +
          `(${rec.priorityName}). Reason: ${rec.reason}. ${rec.deeperReason || ''}`;
      }
    } catch (e) {}
  }
  try {
    const partnerRead = getPartnerRead(state);
    if (partnerRead && partnerRead.inferences.length > 0) {
      context.partnerRead = partnerRead.summary ||
        partnerRead.inferences.map(i => i.message).join('; ');
    }
  } catch (e) {}
  if (triggerType && triggerData) context.triggerDescription = describeTrigger(triggerType, triggerData);
  return context;
}

function describeTrigger(triggerType, triggerData) {
  switch (triggerType) {
    case TRIGGER.BIDDING_START:      return 'The bidding phase just started. Player is looking at their hand and needs to decide their bid.';
    case TRIGGER.ALL_BIDS_IN:        return `All bids are in. Total bid: ${triggerData.totalBid}. Team bid: ${triggerData.teamBid}. Opponent bid: ${triggerData.opponentBid}.`;
    case TRIGGER.HUMAN_TURN:         return 'It\'s the player\'s turn to play a card.';
    case TRIGGER.TRICK_COMPLETE:     return `Trick complete. ${triggerData.isTeamWin ? 'Our team' : 'Opponents'} won it.`;
    case TRIGGER.NIL_IN_DANGER:      return `${triggerData.isHuman ? 'Player\'s' : 'Partner\'s'} nil bid is in danger — they might take a trick.`;
    case TRIGGER.NIL_FAILED:         return `${triggerData.isHuman ? 'Player\'s' : triggerData.isPartner ? 'Partner\'s' : 'Opponent\'s'} nil just failed.`;
    case TRIGGER.OVERBID_RISK:       return `We're at risk of not making our bid. Need ${triggerData.tricksNeeded} more tricks with ${triggerData.tricksLeft} remaining.`;
    case TRIGGER.BAG_WARNING:        return `Bag warning: we're at ${triggerData.currentBags} bags. Penalty at 10.`;
    case TRIGGER.SPADES_BROKEN:      return 'Spades just got broken — someone played a spade on a non-spade trick.';
    case TRIGGER.PARTNER_VOID_DETECTED: return `Partner showed a void — they couldn't follow ${triggerData.suit} and played a different suit.`;
    case TRIGGER.OPPONENT_VOID_DETECTED: return `An opponent showed a void — they couldn't follow ${triggerData.suit}.`;
    case TRIGGER.ROUND_COMPLETE:     return 'The round just ended.';
    default:                         return `Game event: ${triggerType}`;
  }
}
// ═════════════════════════════════════════════════════════════════════════════
// TEACHING TOPIC DESCRIPTIONS — What Ray opens with
// ═════════════════════════════════════════════════════════════════════════════
function getTeachingTopic(triggerType, triggerData) {
  switch (triggerType) {
    case TRIGGER.BIDDING_START:
      return `WALK THE PLAYER THROUGH COUNTING THEIR HAND. Do NOT open with a question like "what do you see?" — the player is a beginner and doesn't know what to look for yet. YOU go first. YOU do the analysis. Follow this structure:

1. Tell them their spade count and quality. Spades are trump — each one is a candidate for a trick. High spades (A, K, Q, J) are stronger than low ones (2-8).
2. Point out aces across all suits — aces are GUARANTEED tricks, call them "sure things."
3. Mention any kings with backup (another card of the same suit) — those are "likely" tricks.
4. Give them a specific bid recommendation based on what you see in their hand.
5. THEN close with ONE short question to confirm they're following — not asking them to do the analysis themselves.

The context includes "Hand by suit" with EXACT counts and card values — USE THOSE EXACT NUMBERS. Do not recount or estimate. If it says spades (3): J, 8, 4 — then they have exactly 3 spades: Jack, 8, and 4.

Keep your opening to 3-5 sentences. You're teaching them HOW to count, not testing whether they already know.`;

    case TRIGGER.ALL_BIDS_IN:
      return 'React to the bid totals. If overbid (total > 13), explain what that means. If team bid is high, pump them up. If low, reassure.';
    case TRIGGER.HUMAN_TURN:
      return 'It\'s the player\'s turn. Help them think through which card to play and why. Consider whether they\'re leading or following, what the goal is (need tricks vs. made bid already), and what the current trick looks like.';
    case TRIGGER.TRICK_COMPLETE:
      return triggerData?.isTeamWin
        ? 'We won the trick. Help the player understand WHY we won — was it power, timing, or reading the table?'
        : 'We lost the trick. Help the player understand if there was a better play, or if it was unavoidable.';
    case TRIGGER.NIL_IN_DANGER:
      return triggerData?.isHuman
        ? 'The player bid nil and is in danger of taking a trick. Remind them to play their absolute lowest card every time.'
        : 'Partner bid nil and is in trouble. Teach the player to play HIGH to protect partner\'s nil.';
    case TRIGGER.NIL_FAILED:
      return 'A nil just failed. If it was the player or partner, address the emotional moment with warmth, then explain what happened.';
    case TRIGGER.OVERBID_RISK:
      return 'We\'re falling short of our bid. Help the player think about why — was the bid too high, or has the play been off?';
    case TRIGGER.BAG_WARNING:
      return `We have ${triggerData?.currentBags || 'a lot of'} bags. Teach the player about bag management — play LOW to avoid overtricks.`;
    case TRIGGER.SPADES_BROKEN:
      return 'Spades just got broken. Explain what this means — spades can now be led, which changes the game.';
    case TRIGGER.PARTNER_VOID_DETECTED:
      return 'Partner just showed a void. Teach the player what a void means and how to use that information.';
    case TRIGGER.OPPONENT_VOID_DETECTED:
      return 'An opponent showed a void. Teach the player what this means for their high cards in that suit.';
    case TRIGGER.ROUND_COMPLETE:
      return 'The round just ended. Give a brief analysis of how it went — what went well, what to improve next round.';
    default:
      return 'Have a teaching conversation about the current game situation.';
  }
}
// ═════════════════════════════════════════════════════════════════════════════
// API COMMUNICATION
// ═════════════════════════════════════════════════════════════════════════════
async function callRayAPI(systemPrompt, messages, model = 'claude-haiku-4-5-20251001') {
  try {
    const response = await fetch('/api/ray', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, messages, model }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Ray API error:', errData.error || response.status);
      return getFallbackResponse();
    }
    const data = await response.json();
    return data.reply || getFallbackResponse();
  } catch (err) {
    console.error('Ray API network error:', err.message);
    return getFallbackResponse();
  }
}

function getFallbackResponse() {
  const fallbacks = [
    `Let me think about that one for a second...`,
    `Hold that thought — I need a minute.`,
    `We'll come back to that.`,
    `My mind went blank for a second there. Keep playing.`,
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}
// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════
export async function checkForTeachingMoment(state, triggerType, triggerData) {
  if (activeConversation) return null;
  if (!shouldAutoTeach(triggerType, state)) return null;
  return await startTeachingMoment(state, triggerType, triggerData);
}

export async function startTeachingMoment(state, triggerType, triggerData = {}) {
  const context = buildGameContext(state, triggerType, triggerData);
  const topic = getTeachingTopic(triggerType, triggerData);
  const systemPrompt = buildTeachingPrompt(topic, context);
  const openingMessage = await callRayAPI(systemPrompt, [
    { role: 'user', content: 'What should I know right now?' },
  ], 'claude-sonnet-4-6');
  conversationCounter++;
  activeConversation = {
    id: conversationCounter,
    triggerType,
    systemPrompt,
    messages: [
      { role: 'assistant', content: openingMessage },
    ],
    startedAt: Date.now(),
    resolved: false,
  };
  return {
    id: activeConversation.id,
    rayMessage: openingMessage,
    isActive: true,
  };
}

export async function sendPlayerMessage(playerMessage, state = null) {
  if (!activeConversation) {
    return {
      rayMessage: 'Start a conversation with me first. Click "Talk to Ray" or wait for a teaching moment.',
      isActive: false,
    };
  }
  activeConversation.messages.push({ role: 'user', content: playerMessage });
  let systemPrompt = activeConversation.systemPrompt;
  if (state) {
    const context = buildGameContext(state);
    const currentTrigger =
      state.phase === GAME_PHASE.PLAYING   ? TRIGGER.HUMAN_TURN    :
      state.phase === GAME_PHASE.BIDDING   ? TRIGGER.BIDDING_START  :
      state.phase === GAME_PHASE.ROUND_END ? TRIGGER.ROUND_COMPLETE :
      activeConversation.triggerType;
    systemPrompt = buildTeachingPrompt(getTeachingTopic(currentTrigger, {}), context);
    activeConversation.systemPrompt = systemPrompt;
  }
  const rayReply = await callRayAPI(systemPrompt, activeConversation.messages);
  activeConversation.messages.push({ role: 'assistant', content: rayReply });
  const messageCount = activeConversation.messages.length;
  const isGettingLong = messageCount > 12;
  return {
    id: activeConversation.id,
    rayMessage: rayReply,
    isActive: true,
    messageCount,
    hint: isGettingLong ? 'Ray might wrap up soon — you can always start a new conversation later.' : null,
  };
}

export async function startPlayerInitiatedConversation(state) {
  let triggerType = TRIGGER.HUMAN_TURN;
  if (state.phase === GAME_PHASE.BIDDING) triggerType = TRIGGER.BIDDING_START;
  if (state.phase === GAME_PHASE.ROUND_END) triggerType = TRIGGER.ROUND_COMPLETE;
  dismissConversation();
  return await startTeachingMoment(state, triggerType, {});
}

export function getActiveConversation() {
  if (!activeConversation) return null;
  return {
    id: activeConversation.id,
    messages: activeConversation.messages.map(m => ({ role: m.role, content: m.content })),
    isActive: !activeConversation.resolved,
  };
}

export function isConversationActive() {
  return activeConversation !== null && !activeConversation.resolved;
}

export function dismissConversation() {
  if (activeConversation) activeConversation.resolved = true;
  activeConversation = null;
}

export function resetConversationState() {
  activeConversation = null;
  conversationCounter = 0;
}

export function getConversationLength() {
  if (!activeConversation) return 0;
  return activeConversation.messages.length;
}