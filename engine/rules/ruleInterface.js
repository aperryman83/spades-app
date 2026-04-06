/**
 * engine/rules/ruleInterface.js
 *
 * Contract definition for all rules modules.
 * This file contains NO game logic — it documents what every valid
 * rules module must export and provides a runtime validation function.
 *
 * Rules:
 * - Every rules module must implement all 8 hooks listed below.
 * - engine/rules/* must NOT import other engine modules (prevents circular deps).
 * - No rules module imports cardUtils, gameState, or any other engine file.
 * - Rule modules are pure: given inputs → deterministic outputs, no side effects.
 *
 * Required hook signatures:
 *
 *   createDeck()
 *     → Card[]
 *     Build and return the full shuffled (or unshuffled) deck for this variant.
 *     Cards must have: { id: string, rank: number, suit: string }
 *     id must be unique and stable — e.g. "14-spades", "joker-big"
 *
 *   getValidBids()
 *     → number[]
 *     Array of valid bid values. NIL is always represented as 0.
 *     Standard: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
 *
 *   isBidAllowed(bid, hand, gameState)
 *     → boolean
 *     Returns true if this specific bid is legal given hand and game context.
 *     Standard: any integer 0–13 is allowed; Blind Nil is not.
 *
 *   isTrump(card)
 *     → boolean
 *     Returns true if this card is a trump card under this ruleset.
 *     Standard: card.suit === 'spades'
 *     JJDD: jokers and specific elevated cards also return true
 *
 *   getCardSortValue(card)
 *     → number
 *     Returns a numeric sort value for the card. Higher = beats lower.
 *     Used by trickResolver and cardUtils for comparisons.
 *     Standard: trump outranks non-trump; within suit, Ace=14 down to 2.
 *
 *   canLeadTrump(hand, gameState)
 *     → boolean
 *     Returns true if the current player is allowed to lead a trump card.
 *     Standard: false unless spades_broken OR hand contains only spades.
 *
 *   getTrickWinner(trickPlays, ledSuit)
 *     → { winner: Seat, winningCard: Card }
 *     trickPlays: Array of { seat: string, card: Card } in play order
 *     ledSuit: string — the suit that was led
 *     Standard: highest trump wins; if no trump, highest card of led suit wins.
 *
 *   scoreRound(roundState)
 *     → { northSouthDelta: number, eastWestDelta: number,
 *          northSouthBagsDelta: number, eastWestBagsDelta: number,
 *          northSouthPenaltyApplied: boolean, eastWestPenaltyApplied: boolean }
 *     roundState must include tricks_won per seat, bids per seat, nil results,
 *     and current bag totals (for penalty threshold detection).
 */

/**
 * The canonical list of required hook names.
 * validateRuleModule() checks against this list.
 */
export const REQUIRED_HOOKS = [
  'createDeck',
  'getValidBids',
  'isBidAllowed',
  'isTrump',
  'getCardSortValue',
  'canLeadTrump',
  'getTrickWinner',
  'scoreRound',
];

/**
 * Validates that a rules module implements all required hooks.
 * Called once at game initialization.
 * Throws a descriptive error if any hook is missing or not a function.
 *
 * @param {Object} rulesModule — the imported rules module object
 * @param {string} [moduleName] — optional display name for error messages
 * @throws {Error} if any required hook is missing or not a function
 */
export function validateRuleModule(rulesModule, moduleName = 'unknown') {
  if (!rulesModule || typeof rulesModule !== 'object') {
    throw new Error(`RuleInterface: module "${moduleName}" is not an object`);
  }

  const missing = [];
  const notFunction = [];

  for (const hook of REQUIRED_HOOKS) {
    if (!(hook in rulesModule)) {
      missing.push(hook);
    } else if (typeof rulesModule[hook] !== 'function') {
      notFunction.push(hook);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `RuleInterface: module "${moduleName}" is missing required hooks: ${missing.join(', ')}`
    );
  }

  if (notFunction.length > 0) {
    throw new Error(
      `RuleInterface: module "${moduleName}" has non-function hooks: ${notFunction.join(', ')}`
    );
  }
}
