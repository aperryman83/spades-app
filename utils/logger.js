/**
 * utils/logger.js
 *
 * Structured logging for Spades with Uncle Ray.
 * All log output goes to the browser console.
 *
 * Usage:
 *   import logger from '../utils/logger.js';
 *   logger.info('trick_complete', { winner: 'north', card: { id: 'A-spades' } });
 *
 * Log levels: DEBUG < INFO < WARN < ERROR
 * Set logger.level to control output verbosity.
 */

const LOG_LEVEL = {
  DEBUG: 0,
  INFO:  1,
  WARN:  2,
  ERROR: 3,
};

const LEVEL_LABEL = {
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR',
};

const LEVEL_STYLE = {
  0: 'color: #8A7060',        // muted — debug noise
  1: 'color: #C8941A',        // amber — normal info
  2: 'color: #E8B84B; font-weight: bold',   // bright amber — warnings
  3: 'color: #E74C3C; font-weight: bold',   // red — errors
};

class Logger {
  constructor() {
    // Default to INFO in production; DEBUG can be toggled from console
    this.level = LOG_LEVEL.INFO;
    this._prefix = '[Spades]';
  }

  /**
   * Core log method. All public methods route through here.
   * @param {number} level   - One of LOG_LEVEL.*
   * @param {string} event   - Camel_snake event name, e.g. 'trick_complete'
   * @param {object} [data]  - Optional structured payload
   */
  _log(level, event, data) {
    if (level < this.level) return;

    const label = LEVEL_LABEL[level];
    const style = LEVEL_STYLE[level];
    const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm

    if (data !== undefined) {
      console.groupCollapsed(
        `%c${this._prefix} [${label}] ${timestamp} — ${event}`,
        style
      );
      console.log(data);
      console.groupEnd();
    } else {
      console.log(
        `%c${this._prefix} [${label}] ${timestamp} — ${event}`,
        style
      );
    }
  }

  debug(event, data) { this._log(LOG_LEVEL.DEBUG, event, data); }
  info(event, data)  { this._log(LOG_LEVEL.INFO,  event, data); }
  warn(event, data)  { this._log(LOG_LEVEL.WARN,  event, data); }
  error(event, data) { this._log(LOG_LEVEL.ERROR, event, data); }

  /**
   * Enable DEBUG level from the browser console:
   *   window.gameLogger.enableDebug()
   */
  enableDebug() {
    this.level = LOG_LEVEL.DEBUG;
    console.log('%c[Spades] Debug logging enabled', 'color: #40916C; font-weight: bold');
  }

  disableDebug() {
    this.level = LOG_LEVEL.INFO;
  }
}

// Singleton — one logger for the whole app
const logger = new Logger();

// Expose on window for dev console access
if (typeof window !== 'undefined') {
  window.gameLogger = logger;
}

export default logger;

/**
 * MANDATORY LOG POINTS (from engineering spec § 10)
 * These events MUST be logged by the modules that own them:
 *
 * game_init         app.js            { ruleset, mode }
 * round_start       gameState.js      { round, dealer, bids:{} }
 * bid_confirmed     bidding.js        { seat, bid }
 * trick_start       turnManager.js    { trickNum, leader }
 * card_played       gameController.js { seat, card }
 * illegal_play      legalMoves.js     { seat, card, reason }
 * trick_complete    trickResolver.js  { winner, winningCard, spadesBroken }
 * nil_failed        gameState.js      { seat }
 * round_end         scoring.js        { northSouthDelta, eastWestDelta, bags }
 * game_over         gameController.js { winner, finalScores }
 * coach_trigger     triggers.js       { trigger, mode, verbosity }
 * bot_decision      botBase.js        { seat, action, value }
 */
