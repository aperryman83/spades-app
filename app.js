/**
 * app.js
 *
 * Single entry point. index.html loads only this file.
 * All module imports chain from here.
 *
 * Step 1 purpose: verify ES module loading works on Replit
 * before any game logic is wired. The render call is a placeholder
 * that will be replaced in Step 3 when gameController is fully built.
 */

// ── Engine layer ──────────────────────────────────────────────────────────────
import { GAME_PHASE, PLAYER_MODE, RULESET } from './engine/constants.js';
import { validateRuleModule }               from './engine/rules/ruleInterface.js';
import standardSpades                       from './engine/rules/standardSpades.js';
import * as cardUtils                       from './engine/cardUtils.js';

// ── Utils ─────────────────────────────────────────────────────────────────────
import logger                               from './utils/logger.js';
import { DEFAULT_VERBOSITY, DEFAULT_INTENSITY, MODE_LABELS } from './utils/helpers.js';

// ── Step 1: Validate rules module loads correctly ─────────────────────────────
validateRuleModule(standardSpades, 'standardSpades');

// ── Expose debug helpers on window (dev only) ─────────────────────────────────
if (typeof window !== 'undefined') {
  window.debugRuleset = function () {
    console.group('[Spades] Active ruleset debug');
    console.log('Ruleset name: standardSpades');
    console.log('All 8 hooks present: ✓ (validated at init)');
    console.log('Module:', standardSpades);
    console.groupEnd();
  };

  window.debugCardUtils = function () {
    // Quick smoke test of cardUtils with a sample card
    const testCard = { id: '14-spades', rank: 14, suit: 'spades' };
    console.group('[Spades] cardUtils smoke test');
    console.log('cardLabel(A♠):', cardUtils.cardLabel(testCard));
    console.log('isSameCard(A♠, A♠):', cardUtils.isSameCard(testCard, { id: '14-spades', rank: 14, suit: 'spades' }));
    console.log('isSameCard(A♠, K♠):', cardUtils.isSameCard(testCard, { id: '13-spades', rank: 13, suit: 'spades' }));
    console.groupEnd();
  };
}

// ── Minimal game state skeleton (will be replaced by engine/gameState.js) ─────

/**
 * Minimal state needed for Step 1 rendering.
 * Full state shape is defined in engine/gameState.js (Step 3).
 */
const state = {
  phase:        GAME_PHASE.INIT,
  mode:         null,
  activeRules:  standardSpades,   // Decision: activeRules lives on state
  activeRuleset: RULESET.STANDARD,
  verbosity:    DEFAULT_VERBOSITY,
  intensity:    DEFAULT_INTENSITY,
};

// ── Log game init (mandatory log point from engineering spec §10) ─────────────
logger.info('game_init', {
  ruleset: state.activeRuleset,
  mode:    state.mode,
  step:    'step-1-skeleton',
});

// ── Step 1 render: splash screen placeholder ──────────────────────────────────

function renderSplash() {
  const root = document.getElementById('app-root');
  if (!root) return;

  root.innerHTML = `
    <div class="screen" style="align-items: center; justify-content: center; gap: 32px;">

      <div class="app-loading">
        <div class="app-loading__spade">♠</div>
        <h1 class="app-loading__title">Spades with Uncle Ray</h1>
        <p class="app-loading__subtitle">"Sit down. Let me show you something."</p>
      </div>

      <div style="display:flex; flex-direction:column; gap: 12px; width: 100%; max-width: 320px;">
        <button class="btn btn--primary" id="btn-new-game">New Game</button>
        <button class="btn" id="btn-how-to-play">How to Play</button>
        <button class="btn" id="btn-settings">Settings</button>
      </div>

      <div style="margin-top: 8px;">
        <div class="ray-bubble">
          <p class="ray-bubble__text">
            "First time? Pick Beginner. I'll walk you through every hand."
          </p>
        </div>
      </div>

      <p class="text-muted text-small" style="position:absolute; bottom: 20px;">
        Modules loaded ✓ — Step 1 complete
      </p>

    </div>
  `;

  // Placeholder button handlers — will be replaced by ui/events.js in Step 3
  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    renderModeSelect();
  });
}

function renderModeSelect() {
  const root = document.getElementById('app-root');
  if (!root) return;

  const modeButtons = Object.entries(MODE_LABELS).map(([mode, labels]) => `
    <button class="mode-btn" data-mode="${mode}">
      <div class="mode-btn__title">${labels.title}</div>
      <div class="mode-btn__desc">${labels.description}</div>
      <div class="mode-btn__ray">${labels.rayLine}</div>
    </button>
  `).join('');

  root.innerHTML = `
    <div class="screen" style="justify-content: center; gap: 24px;">
      <h2 style="text-align:center; font-size: 1.5rem; color: var(--color-accent-gold-lt);">
        How do you want to play?
      </h2>

      <div class="mode-select">
        ${modeButtons}
      </div>

      <button class="btn btn--sm" id="btn-back">← Back</button>
    </div>
  `;

  root.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedMode = btn.dataset.mode;
      logger.info('mode_selected', { mode: selectedMode });
      state.mode  = selectedMode;
      state.phase = GAME_PHASE.DEALING;
      renderGamePlaceholder(selectedMode);
    });
  });

  document.getElementById('btn-back')?.addEventListener('click', renderSplash);
}

function renderGamePlaceholder(mode) {
  const root = document.getElementById('app-root');
  if (!root) return;

  const deck    = standardSpades.createDeck();
  const sample  = deck.slice(0, 5);
  const sampleLabels = sample.map(c => cardUtils.cardLabel(c)).join('  ');

  root.innerHTML = `
    <div class="screen card-table" style="padding: 24px; gap: 16px;">

      <div class="score-panel">
        <div class="score-team score-team--ns">
          <span class="score-team__name">N/S</span>
          <span class="score-team__score">0</span>
          <span class="score-team__bags">0 bags</span>
        </div>
        <span class="score-divider">♠</span>
        <div class="score-team score-team--ew" style="align-items:flex-end;">
          <span class="score-team__name">E/W</span>
          <span class="score-team__score">0</span>
          <span class="score-team__bags">0 bags</span>
        </div>
      </div>

      <div style="text-align:center; padding: 20px 0;">
        <p class="text-muted text-small" style="margin-bottom:8px;">Mode: <strong style="color:var(--color-accent-gold-lt)">${mode}</strong></p>
        <p class="text-muted text-small" style="margin-bottom:16px;">Sample cards from a freshly shuffled deck:</p>
        <p style="font-size: 1.4rem; letter-spacing: 0.1em; color: var(--color-text-primary);">${sampleLabels}</p>
      </div>

      <div class="ray-bubble" style="margin: 0 auto; max-width:300px;">
        <p class="ray-bubble__text">
          "Game engine is loaded. Cards dealt. Step 3 wires the real game."
        </p>
      </div>

      <div style="margin-top: auto; display:flex; gap:8px; justify-content:center;">
        <button class="btn btn--sm" id="btn-back-mode">← Mode</button>
        <button class="btn btn--sm btn--primary">Deal (Step 3)</button>
      </div>
    </div>
  `;

  document.getElementById('btn-back-mode')?.addEventListener('click', renderModeSelect);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
renderSplash();
