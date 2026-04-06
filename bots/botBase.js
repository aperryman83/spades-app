/**
 * bots/botBase.js
 *
 * Bot interface and information contract enforcement.
 * Think of this as Security at the card table — before any bot
 * gets to "think," this module blindfolds them so they can't see
 * other players' hands. Fair play enforced.
 *
 * Rules for this file:
 * - Sanitizes state before any bot call (hides opponent hands)
 * - Every bot must implement getBid() and getPlay()
 * - Bots can see their own hand, all public info, and activeRules
 */

import { PLAYER_SEATS } from '../engine/constants.js';
import logger from '../utils/logger.js';

// ═════════════════════════════════════════════════════════════════════════════
// STATE SANITIZATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Creates a copy of game state with opponent hands hidden.
 * The bot can only see its own hand — all other hands are emptied.
 *
 * @param {Object} state — full GameState
 * @param {string} seat  — the bot's seat
 * @returns {Object} — sanitized state safe for bot consumption
 */
export function sanitizeStateForBot(state, seat) {
  const sanitizedHands = {};

  for (const s of PLAYER_SEATS) {
    if (s === seat) {
      sanitizedHands[s] = [...state.hands[s]]; // bot sees its own hand
    } else {
      sanitizedHands[s] = []; // opponents' hands hidden
    }
  }

  return {
    ...state,
    hands: sanitizedHands,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// BOT EXECUTION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Gets a bid from a bot, with sanitization and logging.
 *
 * @param {Object} bot   — the bot module (must have getBid function)
 * @param {Object} state — full GameState
 * @param {string} seat  — the bot's seat
 * @returns {number}     — the bot's bid
 */
export function getBotBid(bot, state, seat) {
  const sanitized = sanitizeStateForBot(state, seat);
  const bid = bot.getBid(sanitized, seat);

  logger.info('bot_decision', {
    seat,
    action: 'bid',
    value: bid,
  });

  return bid;
}

/**
 * Gets a card play from a bot, with sanitization and logging.
 *
 * @param {Object} bot   — the bot module (must have getPlay function)
 * @param {Object} state — full GameState
 * @param {string} seat  — the bot's seat
 * @returns {Card}       — the card the bot wants to play
 */
export function getBotPlay(bot, state, seat) {
  const sanitized = sanitizeStateForBot(state, seat);
  const card = bot.getPlay(sanitized, seat);

  logger.info('bot_decision', {
    seat,
    action: 'play',
    value: card.id,
  });

  return card;
}
