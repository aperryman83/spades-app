/**
 * engine/constants.js
 *
 * Shared constants that are NOT variant-specific.
 * Nothing here encodes Standard Spades assumptions that would
 * break under JJDD or any other future variant.
 *
 * Rule: if a constant would need to change for JJDD, it does NOT belong here.
 * It belongs in engine/rules/standardSpades.js.
 */

/** The four suits. Order is display order only — no trump hierarchy implied. */
export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];

/**
 * Standard rank integers 2–14.
 * Ace is always stored as 14 internally regardless of variant.
 * These are the raw values; sort order is defined per-variant in the rules module.
 */
export const STANDARD_RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

/** Human-readable display labels for face cards and ace. */
export const RANK_DISPLAY = {
  2:  '2',
  3:  '3',
  4:  '4',
  5:  '5',
  6:  '6',
  7:  '7',
  8:  '8',
  9:  '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

/** Unicode suit symbols. */
export const SUIT_SYMBOL = {
  spades:   '♠',
  hearts:   '♥',
  diamonds: '♦',
  clubs:    '♣',
};

/** The four player seats, in clockwise order starting from North. */
export const PLAYER_SEATS = ['north', 'south', 'east', 'west'];

/** Fast integer index lookup for seats. */
export const SEAT_INDEX = {
  north: 0,
  south: 1,
  east:  2,
  west:  3,
};

/** Partnerships. South is always the human player. */
export const PARTNERSHIPS = {
  northSouth: ['north', 'south'],
  eastWest:   ['east', 'west'],
};

/** Lookup: which partnership does a given seat belong to? */
export const SEAT_TO_PARTNERSHIP = {
  north: 'northSouth',
  south: 'northSouth',
  east:  'eastWest',
  west:  'eastWest',
};

/** Which seat is the partner of a given seat? */
export const SEAT_PARTNER = {
  north: 'south',
  south: 'north',
  east:  'west',
  west:  'east',
};

/** Clockwise play order from any given seat. */
export const CLOCKWISE_FROM = {
  north: ['north', 'east', 'south', 'west'],
  east:  ['east',  'south', 'west', 'north'],
  south: ['south', 'west', 'north', 'east'],
  west:  ['west',  'north', 'east', 'south'],
};

/** Fixed number of tricks per hand in all variants. */
export const MAX_TRICKS_PER_HAND = 13;

/** Bags threshold at which the penalty fires. NOT variant-specific — all variants use 10. */
export const DEFAULT_BAG_LIMIT = 10;

/** Score deducted when bag penalty fires. */
export const DEFAULT_BAG_PENALTY = 100;

/** Score at which a team wins the game. */
export const WIN_SCORE = 500;

/** Score at which a team loses the game (mercy rule). */
export const LOSS_SCORE = -200;

/** The human player is always South. */
export const HUMAN_SEAT = 'south';

/**
 * Bid special values.
 * NIL is stored as integer 0 internally.
 * The UI must never render the value 0 as a label — it always shows "NIL".
 */
export const BID_NIL = 0;

/**
 * Nil outcome states. Stored on a player's nil_status field during a round.
 * null  = player did not bid nil this round
 * 'active'  = bid nil, round ongoing, still at 0 tricks
 * 'made'    = round ended with 0 tricks taken — success
 * 'failed'  = took at least one trick — failure (set immediately)
 */
export const NIL_STATUS = {
  NONE:    null,
  ACTIVE:  'active',
  MADE:    'made',
  FAILED:  'failed',
};

/** Game phases, used on gameState.phase */
export const GAME_PHASE = {
  INIT:       'init',
  MODE_SELECT: 'mode_select',
  DEALING:    'dealing',
  BIDDING:    'bidding',
  PLAYING:    'playing',
  ROUND_END:  'round_end',
  GAME_OVER:  'game_over',
};

/** Player modes from the product spec. */
export const PLAYER_MODE = {
  BEGINNER: 'beginner',
  MEDIUM:   'medium',
  ADVANCED: 'advanced',
};

/** Active ruleset names. Only 'standard' is implemented in MVP. */
export const RULESET = {
  STANDARD: 'standard',
  JJDD:     'jjdd', // Phase 2 — not implemented
};

/** Bot delay range in milliseconds (simulates thinking). */
export const BOT_DELAY_MIN_MS = 500;
export const BOT_DELAY_MAX_MS = 900;
