/**
 * controller/gameController.js
 *
 * The General Manager. Wires all layers together.
 * This is the ONLY file that talks to every layer:
 *   - Engine (game logic)
 *   - Bots (AI decisions)
 *   - UI (rendering)
 *
 * It does NOT implement any logic itself — it just tells
 * each department what to do and when.
 *
 * Rules for this file:
 * - Orchestration ONLY — no game rules, no rendering code
 * - Calls engine functions for all state changes
 * - Calls bots for AI turns
 * - Calls render() after every state change
 */

import {
  GAME_PHASE,
  HUMAN_SEAT,
  PLAYER_SEATS,
  BOT_DELAY_MIN_MS,
  BOT_DELAY_MAX_MS,
} from '../engine/constants.js';

import {
  createInitialGameState,
  dealHands,
  recordBid,
  applyCardPlay,
  applyTrickResult,
  finalizeNilResults,
  applyRoundScore,
  startNewRound,
  setStatus,
} from '../engine/gameState.js';

import { isValidBid } from '../engine/bidding.js';
import { getLegalCards, isLegalPlay } from '../engine/legalMoves.js';
import { resolveTrick } from '../engine/trickResolver.js';
import { scoreRound, checkGameEnd } from '../engine/scoring.js';
import {
  advanceTurn,
  isBiddingComplete,
  isTrickComplete,
  isRoundComplete,
  getBiddingOrder,
} from '../engine/turnManager.js';

import { getBotBid, getBotPlay } from '../bots/botBase.js';
import rookieBot from '../bots/rookieBot.js';

import { validateRuleModule } from '../engine/rules/ruleInterface.js';
import standardSpades from '../engine/rules/standardSpades.js';

import logger from '../utils/logger.js';
import { delay, randomInt } from '../utils/helpers.js';

// ═════════════════════════════════════════════════════════════════════════════
// GAME STATE — held in closure, accessed by all controller functions
// ═════════════════════════════════════════════════════════════════════════════

let gameState = null;
let renderFn = null;        // set by init — the UI render function
let botInProgress = false;  // prevents double-firing bot turns

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function isHumanTurn() {
  return gameState.current_turn === HUMAN_SEAT;
}

function isBotSeat(seat) {
  return seat !== HUMAN_SEAT;
}

function getBotForSeat(seat) {
  // MVP: all bots use rookieBot
  return rookieBot;
}

function render() {
  if (renderFn) renderFn(gameState);
}

async function botDelay() {
  const ms = randomInt(BOT_DELAY_MIN_MS, BOT_DELAY_MAX_MS);
  await delay(ms);
}

// ═════════════════════════════════════════════════════════════════════════════
// INITIALIZE GAME
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Starts a new game. Called when the player selects a mode.
 *
 * @param {string} mode      — 'beginner' | 'medium' | 'advanced'
 * @param {Function} renderCallback — the UI render function
 */
export function initGame(mode, renderCallback) {
  renderFn = renderCallback;
  botInProgress = false;

  // MVP: always use standard spades
  const activeRules = standardSpades;

  gameState = createInitialGameState(mode, activeRules);
  gameState = dealHands(gameState);

  render();

  // Start the bidding phase — kick off bot bids if a bot goes first
  startBiddingPhase();
}

// ═════════════════════════════════════════════════════════════════════════════
// BIDDING PHASE
// ═════════════════════════════════════════════════════════════════════════════

async function startBiddingPhase() {
  gameState = setStatus(gameState, GAME_PHASE.BIDDING);
  render();

  // Process bot bids until it's the human's turn or bidding is complete
  await processBotBids();
}

async function processBotBids() {
  while (
    gameState.status === GAME_PHASE.BIDDING &&
    !isBiddingComplete(gameState) &&
    isBotSeat(gameState.current_turn)
  ) {
    const seat = gameState.current_turn;
    const bot = getBotForSeat(seat);

    await botDelay();

    const bid = getBotBid(bot, gameState, seat);
    gameState = recordBid(gameState, seat, bid);
    gameState = advanceTurn(gameState);
    render();
  }

  // Check if bidding is now complete (all 4 bids in)
  if (isBiddingComplete(gameState)) {
    startPlayingPhase();
  }
  // Otherwise it's the human's turn to bid — UI will call handleHumanBid
}

/**
 * Called by the UI when the human player submits a bid.
 *
 * @param {number} bid — the bid value (0 = nil, 1–13)
 */
export async function handleHumanBid(bid) {
  if (gameState.status !== GAME_PHASE.BIDDING) return;
  if (gameState.current_turn !== HUMAN_SEAT) return;

  // Validate the bid
  const hand = gameState.hands[HUMAN_SEAT];
  if (!isValidBid(bid, hand, gameState)) return;

  // Record it
  gameState = recordBid(gameState, HUMAN_SEAT, bid);
  gameState = advanceTurn(gameState);
  render();

  // Continue with any remaining bot bids
  if (!isBiddingComplete(gameState)) {
    await processBotBids();
  } else {
    startPlayingPhase();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PLAYING PHASE
// ═════════════════════════════════════════════════════════════════════════════

function startPlayingPhase() {
  gameState = setStatus(gameState, GAME_PHASE.PLAYING);
  render();

  // If a bot leads the first trick, kick off bot play
  if (isBotSeat(gameState.current_turn)) {
    processBotPlays();
  }
}

async function processBotPlays() {
  if (botInProgress) return;
  botInProgress = true;

  try {
    while (
      gameState.status === GAME_PHASE.PLAYING &&
      isBotSeat(gameState.current_turn)
    ) {
      const seat = gameState.current_turn;
      const bot = getBotForSeat(seat);

      await botDelay();

      const card = getBotPlay(bot, gameState, seat);
      await executeCardPlay(seat, card);
    }
  } finally {
    botInProgress = false;
  }
}

/**
 * Called by the UI when the human player taps a card.
 *
 * @param {Object} card — the card the player wants to play
 */
export async function handleHumanPlay(card) {
  if (gameState.status !== GAME_PHASE.PLAYING) return;
  if (gameState.current_turn !== HUMAN_SEAT) return;

  const hand = gameState.hands[HUMAN_SEAT];
  const trickPlays = gameState.current_trick_plays;
  const isLeading = trickPlays.length === 0;
  const ledSuit = isLeading ? null : trickPlays[0].card.suit;

  // Check if this card is legal
  if (!isLegalPlay(card, hand, ledSuit, isLeading, gameState)) return;

  await executeCardPlay(HUMAN_SEAT, card);

  // Continue with bot plays if it's their turn
  if (
    gameState.status === GAME_PHASE.PLAYING &&
    isBotSeat(gameState.current_turn)
  ) {
    await processBotPlays();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTE A CARD PLAY (shared by human and bot)
// ═════════════════════════════════════════════════════════════════════════════

async function executeCardPlay(seat, card) {
  // 1. Record the play on the Scoreboard
  gameState = applyCardPlay(gameState, seat, card);

  logger.info('card_played', { seat, card: card.id });
  render();

  // 2. Check if the trick is complete (4 cards played)
  if (isTrickComplete(gameState)) {
    await resolveTrickAndContinue();
  } else {
    // Advance to next player
    gameState = advanceTurn(gameState);
    render();
  }
}

async function resolveTrickAndContinue() {
  const plays = gameState.current_trick_plays;
  const ledSuit = plays[0].card.suit;

  // Small pause so player can see the completed trick
  await delay(800);

  // 3. Resolve who won
  const trickResult = resolveTrick(plays, ledSuit, gameState);

  // 4. Update the Scoreboard with trick result
  gameState = applyTrickResult(gameState, trickResult);
  render();

  // 5. Check if the round is over (13 tricks played)
  if (isRoundComplete(gameState)) {
    await endRound();
  } else {
    // Next trick — winner leads
    // If a bot won, they need to play
    if (isBotSeat(gameState.current_turn)) {
      await processBotPlays();
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUND END
// ═════════════════════════════════════════════════════════════════════════════

async function endRound() {
  // Finalize nil outcomes (active → made)
  gameState = finalizeNilResults(gameState);

  // Calculate scores
  const deltas = scoreRound(gameState);
  gameState = applyRoundScore(gameState, deltas);

  render();

  // Check if game is over
  const endCheck = checkGameEnd(gameState);
  if (endCheck.over) {
    gameState = setStatus(gameState, GAME_PHASE.GAME_OVER);
    logger.info('game_over', {
      winner: endCheck.winner,
      finalScores: {
        northSouth: gameState.scores.north_south.total,
        eastWest: gameState.scores.east_west.total,
      },
    });
    render();
    return;
  }

  // Game continues — show round end screen
  // UI will call handleNextRound() when player is ready
}

/**
 * Called by the UI when the player clicks "Next Round".
 */
export async function handleNextRound() {
  if (gameState.status !== GAME_PHASE.ROUND_END) return;

  gameState = startNewRound(gameState);
  gameState = dealHands(gameState);
  render();

  await startBiddingPhase();
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC GETTERS (for UI to read state)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns the current game state. UI uses this to know what to render.
 */
export function getState() {
  return gameState;
}

/**
 * Returns the legal cards the human can play right now.
 * Used by the UI to highlight playable cards.
 */
export function getHumanLegalCards() {
  if (!gameState || gameState.status !== GAME_PHASE.PLAYING) return [];
  if (gameState.current_turn !== HUMAN_SEAT) return [];

  const hand = gameState.hands[HUMAN_SEAT];
  const trickPlays = gameState.current_trick_plays;
  const isLeading = trickPlays.length === 0;
  const ledSuit = isLeading ? null : trickPlays[0].card.suit;

  return getLegalCards(hand, ledSuit, isLeading, gameState);
}
