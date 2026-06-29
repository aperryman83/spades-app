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
 *
 * Usage:
 *   import { startTeachingMoment, sendPlayerMessage,
 *            getConversation, isConversationActive,
 *            dismissConversation } from './coachState.js';
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
/**
 * Module-level conversation state.
 * Only ONE conversation active at a time — Ray doesn't talk over himself.
 *
 * This is Ray's OWN state (his notebook), NOT game state.
 */
let activeConversation = null;
let conversationCounter = 0;
// ═════════════════════════════════════════════════════════════════════════════
// TEACHING PRIORITY — Decides when Ray speaks up automatically
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Teaching priority levels determine which moments trigger
 * Ray automatically vs. waiting for the player to ask.
 *
 * HIGH: Always auto-teach (nil failure, getting set, bag penalty)
 * MEDIUM: Auto-teach for beginners, on-demand for others
 * LOW: Only auto-teach at highest verbosity
 */
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
/**
 * Should Ray auto-start a conversation for this trigger?
 * Depends on priority + player mode + verbosity setting.
 *
 * @param {string} triggerType — from TRIGGER enum
 * @param {Object} state — current game state
 * @returns {boolean}
 */
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
// GAME CONTEXT BUILDER — Translates game state into plain English for Ray
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Reads the current game state and builds a plain-language context
 * object that gets injected into Ray's system prompt.
 *
 * @param {Object} state — current game state
 * @param {string} [triggerType] — what just happened
 * @param {Object} [triggerData] — data about what happened
 * @returns {Object} — structured context for rayPrompt.js
 */
function buildGameContext(state, triggerType, triggerData) {
  const context = {};
  // Phase
  context.phase = state.phase;
  // Player's hand — both as a list AND as an explicit suit breakdown
  // The breakdown prevents Ray from having to count and getting it wrong
  const humanHand = state.hands?.[HUMAN_SEAT];
  if (humanHand && humanHand.length > 0) {
    context.hand = humanHand
      .map(c => `${RANK_DISPLAY[c.rank]}${SUIT_SYMBOL[c.suit]}`)
      .join(', ');

    // Pre-calculate suit breakdown so Ray always has exact counts
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
  // Bids
  if (state.bids) {
    const bidEntries = Object.entries(state.bids)
      .filter(([_, b]) => b !== null && b !== undefined)
      .map(([seat, bid]) => {
        const label = seat === HUMAN_SEAT ? 'You' :
                      seat === SEAT_PARTNER[HUMAN_SEAT] ? 'Partner' :
                      `Opponent (${seat})`;
        return `${label}: ${bid === 0 ? 'Nil' : bid}`;
      });
    if (bidEntries.length > 0) {
      context.bids = bidEntries.join(', ');
    }
  }
  // Tricks won
  if (state.tricks_won) {
    const humanTeam = (state.tricks_won[HUMAN_SEAT] || 0) +
                      (state.tricks_won[SEAT_PARTNER[HUMAN_SEAT]] || 0);
    const oppTeam = Object.entries(state.tricks_won)
      .filter(([seat]) => seat !== HUMAN_SEAT && seat !== SEAT_PARTNER[HUMAN_SEAT])
      .reduce((sum, [_, t]) => sum + t, 0);
    context.tricksWon = humanTeam;
    context.opponentTricksWon = oppTeam;
    // How many more do we need?
    const teamBid = (state.bids?.[HUMAN_SEAT] || 0) +
                    (state.bids?.[SEAT_PARTNER[HUMAN_SEAT]] || 0);
    context.tricksNeeded = Math.max(0, teamBid - humanTeam);
  }
  // Current trick — with explicit leading/following status so Ray never
  // tells the player to "lead" when someone has already played a card
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
                        play.seat === SEAT_PARTNER[HUMAN_SEAT] ? 'Partner' :
                        `Opponent`;
          return `${label}: ${RANK_DISPLAY[play.card.rank]}${SUIT_SYMBOL[play.card.suit]}`;
        })
        .join(', ');
    }
  }
  // Bags
  if (state.scores?.north_south?.bags !== undefined) {
    context.bags = state.scores.north_south.bags;
  }
  // Scores
  if (state.scores) {
    context.scores = {
      us: state.scores.north_south?.total ?? 0,
      them: state.scores.east_west?.total ?? 0,
    };
  }
  // Nil status
  const humanNil = state.nil_status?.[HUMAN_SEAT];
  const partnerNil = state.nil_status?.[SEAT_PARTNER[HUMAN_SEAT]];
  if (humanNil) context.nilStatus = `You bid nil (status: ${humanNil})`;
  if (partnerNil) context.nilStatus = `Partner bid nil (status: ${partnerNil})`;
  // Bid recommendation (during bidding phase)
  if (state.phase === GAME_PHASE.BIDDING) {
    try {
      const rec = getBidRecommendation(state);
      if (rec) {
        context.bidRecommendation = `Suggested bid: ${rec.bid} (confidence: ${Math.round(rec.confidence * 100)}%). ` +
          `Sure tricks: ${rec.sureTricks}, Possible: ${rec.possibleTricks}. ` +
          (rec.nilEligible ? 'Nil is an option. ' : '') +
          (rec.reasoning?.length > 0 ? rec.reasoning.join(' ') : '');
      }
    } catch (e) {
      // Bidding tutor may not work in all states
    }
  }
  // Play recommendation (during play phase, human's turn)
  if (state.phase === GAME_PHASE.PLAYING && state.current_turn === HUMAN_SEAT) {
    try {
      const rec = getPlayRecommendation(state);
      if (rec) {
        context.playRecommendation = `Suggested play: ${RANK_DISPLAY[rec.card.rank]}${SUIT_SYMBOL[rec.card.suit]} ` +
          `(${rec.priorityName}). Reason: ${rec.reason}. ${rec.deeperReason || ''}`;
      }
    } catch (e) {
      // Play advisor may not work in all states
    }
  }
  // Partner inference
  try {
    const partnerRead = getPartnerRead(state);
    if (partnerRead && partnerRead.inferences.length > 0) {
      context.partnerRead = partnerRead.summary ||
        partnerRead.inferences.map(i => i.message).join('; ');
    }
  } catch (e) {
    // Partner inference may not work in all states
  }
  // What triggered this conversation
  if (triggerType && triggerData) {
    context.triggerDescription = describeTrigger(triggerType, triggerData);
  }
  return context;
}
/**
 * Converts a trigger event into plain English for Ray's context.
 */
function describeTrigger(triggerType, triggerData) {
  switch (triggerType) {
    case TRIGGER.BIDDING_START:
      return 'The bidding phase just started. Player is looking at their hand and needs to decide their bid.';
    case TRIGGER.ALL_BIDS_IN:
      return `All bids are in. Total bid: ${triggerData.totalBid}. Team bid: ${triggerData.teamBid}. Opponent bid: ${triggerData.opponentBid}.`;
    case TRIGGER.HUMAN_TURN:
      return 'It\'s the player\'s turn to play a card.';
    case TRIGGER.TRICK_COMPLETE:
      return `Trick complete. ${triggerData.isTeamWin ? 'Our team' : 'Opponents'} won it.`;
    case TRIGGER.NIL_IN_DANGER:
      return `${triggerData.isHuman ? 'Player\'s' : 'Partner\'s'} nil bid is in danger — they might take a trick.`;
    case TRIGGER.NIL_FAILED:
      return `${triggerData.isHuman ? 'Player\'s' : triggerData.isPartner ? 'Partner\'s' : 'Opponent\'s'} nil just failed.`;
    case TRIGGER.OVERBID_RISK:
      return `The team's total bid of ${triggerData.totalBid} is high risk. ${triggerData.notes}.`;
    case TRIGGER.BAG_WARNING:
      return `Team has ${triggerData.bags} bags. Ten bags = -100 point penalty.`;
    case TRIGGER.SPADES_BROKEN:
      return 'Spades have been broken this round – now anyone can lead spades.';
    case TRIGGER.PARTNER_VOID_DETECTED:
      return `Partner appears to be void in ${triggerData.suit}.+ or $+{triggerData.card} played.`;
    case TRIGGER.OPPONENT_VOID_DETECTED:
      return `An opponent appears to be void in ${triggerData.suit}.`;
    case TRIGGER.ROUND_COMPLETE:
      return `Round complete. Final scores: Us: ${triggerData.usScore}, Them: ${triggerData.themScore}.`;
    default:
      return `${triggerType} event occurred.`;
  }
}
// ═════════════════════════════════════════════════════════════════════════════
// API COMMUNICATION — Talks to the server proxy
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Sends a request to the /api/ray endpoint and returns Ray's response.
 *
 * @param {string} systemPrompt — Ray's personality + current context
 * @param {Array} messages — Conversation history in Anthropic format
 * @param {string} [model] — Model to use (defaults to Haiku)
 * @returns {Promise<string>} — Ray's response text
 */
async function callRayAPI(systemPrompt, messages, model = 'claude-haiku-4-5-20251001') {
  try {
    const response = await fetch('/api/ray', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, messages, model }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API ${response.status}: ${err}`);
    }
    const data = await response.json();
    return data.response || '[Ray is stumped right now]';
  } catch (err) {
    console.error('[Ray API] Error:', err);
    return "Sorry, I lost my train of thought. What were you asking?";
  }
}
// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API — Exported functions used by triggers.js and app.js
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Starts a new Ray-initiated teaching moment.
 * Called by triggers.js when a teaching event occurs.
 *
 * @param {string} triggerType — what just happened (from TRIGGER enum)
 * @param {Object} state — current game state
 * @param {Object} [triggerData] — extra info about the trigger
 * @param {string} [playerMode] — player skill level
 * @returns {Promise<Object|null>} — the new conversation object, or null if skipped
 */
export async function startTeachingMoment(triggerType, state, triggerData = {}, playerMode) {
  // Don't interrupt an active conversation
  if (activeConversation) {
    console.log(`[Ray] Already talking — skipping new trigger ${triggerType}`);
    return null;
  }
  // Check if we should auto-teach
  if (!shouldAutoTeach(triggerType, state)) {
    console.log(`[Ray] Priority check failed — skipping ${triggerType}`);
    return null;
  }
  // Gather game context
  const gameContext = buildGameContext(state, triggerType, triggerData);
  const systemPrompt = buildSystemPrompt(gameContext, playerMode);
  // Use Sonnet for opening message where card reasoning matters most
  const openingMessage = await callRayAPI(systemPrompt, [
    { role: 'user', content: 'What should I know right now?' },
  ], 'claude-sonnet-4-6');
  // Create new conversation
  conversationCounter++;
  activeConversation = {
    id: `conversation-${conversationCounter}`,
    triggerType,
    systemPrompt,
    messages: [{ role: 'assistant', content: openingMessage }],
    createdAt: Date.now(),
  };
  return { ...activeConversation };
}
/**
 * Player responds to Ray.
 * Called when the player types a message in the chat.
 � *
 * @param {string} playerMessage — what the player typed
 * @returns {Promise<Object|null>} — updated conversation, or null if none active
 */
export async function sendPlayerMessage(playerMessage) {
  if (!activeConversation) {
    console.warn('[Ray] No active conversation for player message');
    return null;
  }
  // Append player message to history
  activeConversation.messages.push({ role: 'user', content: playerMessage });
  // Build messages array for API (opening message + all exchanges)
  const messagesForAPI = [
    { role: 'user', content: 'What should I know right now?' },
    ...activeConversation.messages,
  ];
  // Get Ray's reply (uses default Haiku for follow-ups)
  const reply = await callRayAPI(
    activeConversation.systemPrompt,
    messagesForAPI
  );
  // Append Ray's reply to history
  activeConversation.messages.push({ role: 'assistant', content: reply });
  return { ...activeConversation };
}
/**
 * Starts a new conversation initiated by the PAYER (not a trigger).
 * Used when player clicks "Chat with Ray" or types without an active conversation.
 *
 * @param {string} playerMessage — what the player typed
 * @param {Object} state — current game state
 * @param {string} [playerMode] — player skill level
 * @returns {Promise<Object>} — the new conversation object
 */
export async function startPlayerInitiatedChat(playerMessage, state, playerMode) {
  // If conversation is already active, just send the message to it
  if (activeConversation) {
    return sendPlayerMessage(playerMessage);
  }
  const gameContext = buildGameContext(state);
  const systemPrompt = buildSystemPrompt(gameContext, playerMode);
  // Use Haiku for player-initiated chats (conversational, no card analysis)
  const reply = await callRayAPI(systemPrompt, [
    { role: 'user', content: playerMessage },
  ]);
  conversationCounter++;
  activeConversation = {
    id: `conversation-${conversationCounter}`,
    triggerType: 'player_initiated',
    systemPrompt,
    messages: [
      { role: 'user', content: playerMessage },
      { role: 'assistant', content: reply },
    ],
    createdAt: Date.now(),
  };
  return { ...activeConversation };
}
/**
 * Gets the current active conversation (or null).
 */
export function getConversation() {
  return activeConversation ? { ...activeConversation } : null;
}
/**
 * Return �════════════════════════════════════════════════════════
// PUBLIC API — What the game controller and UI call
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Checks if a trigger should start a teaching conversation.
 * If yes, starts the conversation and returns the initial message.
 * If no, returns null.
 *
 * Called by the game controller whenever a trigger fires.
 *
 * @param {Object} state — current game state
 * @param {string} triggerType — from TRIGGER enum
 * @param {Object} triggerData — data from the trigger
 * @returns {Promise<Object|null>} — conversation object or null
 */
export async function checkForTeachingMoment(state, triggerType, triggerData) {
  // Don't interrupt an active conversation
  if (activeConversation) return null;
  // Should Ray speak up automatically?
  if (!shouldAutoTeach(triggerType, state)) return null;
  return await startTeachingMoment(state, triggerType, triggerData);
}
/**
 * Starts a teaching conversation about a specific trigger.
 * Can be called automatically (from checkForTeachingMoment) or
 * manually (when the player clicks "Talk to Ray").
 *
 * @param {Object} state — current game state
 * @param {string} triggerType — what happened
 * @param {Object} [triggerData] — data about what happened
 * @returns {Promise<Object>} — conversation object with Ray's opening message
 */
export async function startTeachingMoment(state, triggerType, triggerData = {}) {
  const context = buildGameContext(state, triggerType, triggerData);
  const topic = getTeachingTopic(triggerType, triggerData);
  const systemPrompt = buildTeachingPrompt(topic, context);
  // Ray's opening message
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
/**
 * Sends the player's typed response to Ray and gets his reply.
 * This is the back-and-forth — no dead ends, no multiple choice limits.
 *
 * @param {string} playerMessage — what the player typed
 * @param {Object} [state] — optional fresh game state for context updates
 * @returns {Promise<Object>} — Ray's response
 */
export async function sendPlayerMessage(playerMessage, state = null) {
  if (!activeConversation) {
    return {
      rayMessage: 'Start a conversation with me first. Click "Talk to Ray" or wait for a teaching moment.',
      isActive: false,
    };
  }
  // Add player message to history
  activeConversation.messages.push({
    role: 'user',
    content: playerMessage,
  });
  // If fresh state provided, update context in system prompt.
  // Always use the current phase to pick the topic — not the original trigger —
  // so Ray never talks about bidding when the trick is already in progress.
  let systemPrompt = activeConversation.systemPrompt;
  if (state) {
    const context = buildGameContext(state);
    const currentTrigger =
      state.phase === GAME_PHASE.PLAYING  ? TRIGGER.HUMAN_TURN     :
      state.phase === GAME_PHASE.BIDDING  ? TRIGGER.BIDDING_START   :
      state.phase === GAME_PHASE.ROUND_END ? TRIGGER.ROUND_COMPLETE :
      activeConversation.triggerType;
    systemPrompt = buildTeachingPrompt(
      getTeachingTopic(currentTrigger, {}),
      context
    );
    activeConversation.systemPrompt = systemPrompt;
  }
  // Get Ray's response
  const rayReply = await callRayAPI(systemPrompt, activeConversation.messages);
  // Add to history
  activeConversation.messages.push({
    role: 'assistant',
    content: rayReply,
  });
  // Check if conversation is getting long (keep API costs reasonable)
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
/**
 * Player-initiated conversation — when they click "Talk to Ray"
 * without a specific trigger. Ray offers general help based on
 * the current game situation.
 *
 * @param {Object} state — current game state
 * @returns {Promise<Object>} — conversation object
 */
export async function startPlayerInitiatedConversation(state) {
  // Determine what's most relevant to talk about
  let triggerType = TRIGGER.HUMAN_TURN;
  if (state.phase === GAME_PHASE.BIDDING) triggerType = TRIGGER.BIDDING_START;
  if (state.phase === GAME_PHASE.ROUND_END) triggerType = TRIGGER.ROUND_COMPLETE;
  // Dismiss any existing conversation
  dismissConversation();
  return await startTeachingMoment(state, triggerType, {});
}
/**
 * Returns the active conversation object, or null.
 * Used by the UI to display the conversation panel.
 */
export function getActiveConversation() {
  if (!activeConversation) return null;
  return {
    id: activeConversation.id,
    messages: activeConversation.messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    isActive: !activeConversation.resolved,
  };
}
/**
 * Is there a conversation currently active?
 */
export function isConversationActive() {
  return activeConversation !== null && !activeConversation.resolved;
}
/**
 * Dismiss the current conversation. Player is done talking.
 */
export function dismissConversation() {
  if (activeConversation) {
    activeConversation.resolved = true;
  }
  activeConversation = null;
}
/**
 * Reset all conversation state. Called on new game.
 */
export function resetConversationState() {
  activeConversation = null;
  conversationCounter = 0;
}
/**
 * Get conversation history length (for UI display).
 */
export function getConversationLength() {
  if (!activeConversation) return 0;
  return activeConversation.messages.length;
}
