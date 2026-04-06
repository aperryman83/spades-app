/**
 * app.js
 *
 * Single entry point. index.html loads only this file.
 * Handles: splash screen, mode select, and wiring the game UI
 * to the game controller.
 */

// ── Engine layer ──────────────────────────────────────────────────────────────
import { GAME_PHASE, PLAYER_MODE, HUMAN_SEAT, PLAYER_SEATS, SEAT_PARTNER } from './engine/constants.js';
import { cardLabel, suitSymbol, isTrumpCard, sortHand } from './engine/cardUtils.js';

// ── Controller ────────────────────────────────────────────────────────────────
import {
  initGame,
  handleHumanBid,
  handleHumanPlay,
  handleNextRound,
  getState,
  getHumanLegalCards,
} from './controller/gameController.js';

// ── Utils ─────────────────────────────────────────────────────────────────────
import logger from './utils/logger.js';
import { MODE_LABELS } from './utils/helpers.js';

// ── Root element ──────────────────────────────────────────────────────────────
const root = document.getElementById('app-root');

// ═════════════════════════════════════════════════════════════════════════════
// SPLASH SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function renderSplash() {
  root.innerHTML = `
    <div class="screen" style="align-items: center; justify-content: center; gap: 32px;">
      <div class="app-loading">
        <div class="app-loading__spade">♠</div>
        <h1 class="app-loading__title">Spades with Uncle Ray</h1>
        <p class="app-loading__subtitle">"Sit down. Let me show you something."</p>
      </div>
      <div style="display:flex; flex-direction:column; gap: 12px; width: 100%; max-width: 320px;">
        <button class="btn btn--primary" id="btn-new-game">New Game</button>
      </div>
    </div>
  `;
  document.getElementById('btn-new-game')?.addEventListener('click', renderModeSelect);
}

// ═════════════════════════════════════════════════════════════════════════════
// MODE SELECT
// ═════════════════════════════════════════════════════════════════════════════

function renderModeSelect() {
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
      <div class="mode-select">${modeButtons}</div>
      <button class="btn btn--sm" id="btn-back">← Back</button>
    </div>
  `;

  root.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      logger.info('mode_selected', { mode });
      initGame(mode, renderGame);
    });
  });

  document.getElementById('btn-back')?.addEventListener('click', renderSplash);
}

// ═════════════════════════════════════════════════════════════════════════════
// GAME RENDERER — called by gameController after every state change
// ═════════════════════════════════════════════════════════════════════════════

function renderGame(state) {
  if (!state) return;

  switch (state.status) {
    case GAME_PHASE.BIDDING:
      renderBiddingScreen(state);
      break;
    case GAME_PHASE.PLAYING:
      renderPlayingScreen(state);
      break;
    case GAME_PHASE.ROUND_END:
      renderRoundEndScreen(state);
      break;
    case GAME_PHASE.GAME_OVER:
      renderGameOverScreen(state);
      break;
    default:
      renderBiddingScreen(state);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// BIDDING SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function renderBiddingScreen(state) {
  const hand = sortHand(state.hands[HUMAN_SEAT], state);
  const isMyTurn = state.current_turn === HUMAN_SEAT;
  const handHTML = hand.map(card => renderCardHTML(card, false, false)).join('');

  // Show existing bids
  const bidDisplay = PLAYER_SEATS.map(seat => {
    const bid = state.bids[seat];
    const label = seat === HUMAN_SEAT ? 'You (S)' : seat.charAt(0).toUpperCase();
    const bidText = bid === null ? '...' : bid === 0 ? 'NIL' : bid;
    const isActive = state.current_turn === seat;
    return `<div class="bid-display__seat ${isActive ? 'bid-display__seat--active' : ''}">
      <span class="bid-display__label">${label}</span>
      <span class="bid-display__value">${bidText}</span>
    </div>`;
  }).join('');

  // Bid buttons (only if it's my turn)
  let bidButtonsHTML = '';
  if (isMyTurn) {
    const buttons = [];
    buttons.push(`<button class="bid-btn bid-btn--nil" data-bid="0">NIL</button>`);
    for (let i = 1; i <= 7; i++) {
      buttons.push(`<button class="bid-btn" data-bid="${i}">${i}</button>`);
    }
    // Dropdown for 8-13
    buttons.push(`<select class="bid-dropdown" id="bid-high">
      <option value="">8+</option>
      ${[8,9,10,11,12,13].map(n => `<option value="${n}">${n}</option>`).join('')}
    </select>`);
    bidButtonsHTML = `
      <div class="bid-selector">${buttons.join('')}</div>
    `;
  } else {
    bidButtonsHTML = `
      <div style="text-align:center; padding: 16px; color: var(--color-text-secondary);">
        Waiting for ${state.current_turn} to bid...
      </div>
    `;
  }

  root.innerHTML = `
    <div class="screen card-table" style="padding: 16px; gap: 12px;">
      ${renderScorePanel(state)}

      <div style="text-align:center; color: var(--color-accent-gold-lt); font-size: 1.1rem; font-weight: 600;">
        Round ${state.current_round} — Bidding
      </div>

      <div class="bid-display">${bidDisplay}</div>

      ${bidButtonsHTML}

      <div class="ray-bubble" style="margin: 0 auto; max-width:300px;">
        <p class="ray-bubble__text">
          ${isMyTurn ? '"Look at your hand. Count your winners."' : '"Watch what they bid. It tells you everything."'}
        </p>
      </div>

      <div style="margin-top:auto;">
        <div style="text-align:center; color: var(--color-text-muted); font-size: 0.8rem; margin-bottom: 8px;">Your Hand</div>
        <div class="hand-row">${handHTML}</div>
      </div>
    </div>
  `;

  // Wire bid buttons
  if (isMyTurn) {
    root.querySelectorAll('.bid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bid = parseInt(btn.dataset.bid, 10);
        handleHumanBid(bid);
      });
    });

    const dropdown = document.getElementById('bid-high');
    if (dropdown) {
      dropdown.addEventListener('change', () => {
        const val = parseInt(dropdown.value, 10);
        if (!isNaN(val)) handleHumanBid(val);
      });
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PLAYING SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function renderPlayingScreen(state) {
  const hand = sortHand(state.hands[HUMAN_SEAT], state);
  const legalCards = getHumanLegalCards();
  const isMyTurn = state.current_turn === HUMAN_SEAT;

  // Render hand with legal/illegal highlighting
  const handHTML = hand.map(card => {
    const isLegal = legalCards.some(c => c.id === card.id);
    const clickable = isMyTurn && isLegal;
    return renderCardHTML(card, !isLegal && isMyTurn, clickable);
  }).join('');

  // Render the trick area (center of table)
  const trickHTML = renderTrickArea(state);

  // Bid summary
  const bidSummary = PLAYER_SEATS.map(seat => {
    const label = seat === HUMAN_SEAT ? 'You' : seat.charAt(0).toUpperCase();
    const bid = state.bids[seat] === 0 ? 'NIL' : state.bids[seat];
    const tricks = state.tricks_won[seat];
    return `<span style="margin: 0 6px;">${label}: ${bid}(${tricks})</span>`;
  }).join('');

  root.innerHTML = `
    <div class="screen card-table" style="padding: 12px; gap: 8px;">
      ${renderScorePanel(state)}

      <div style="text-align:center; font-size: 0.85rem; color: var(--color-text-secondary);">
        ${bidSummary}
      </div>

      <div style="text-align:center; font-size: 0.75rem; color: var(--color-text-muted);">
        Trick ${Math.min(state.current_trick, 13)} of 13
        ${state.spades_broken ? ' · ♠ Broken' : ''}
      </div>

      ${trickHTML}

      <div style="margin-top:auto;">
        <div style="text-align:center; color: ${isMyTurn ? 'var(--color-accent-gold-lt)' : 'var(--color-text-muted)'}; font-size: 0.8rem; margin-bottom: 8px; font-weight: ${isMyTurn ? '600' : '400'};">
          ${isMyTurn ? 'Your turn — tap a card' : `Waiting for ${state.current_turn}...`}
        </div>
        <div class="hand-row">${handHTML}</div>
      </div>
    </div>
  `;

  // Wire card clicks
  if (isMyTurn) {
    root.querySelectorAll('.card[data-card-id]').forEach(el => {
      if (el.classList.contains('card--illegal')) return;
      el.addEventListener('click', () => {
        const cardId = el.dataset.cardId;
        const card = hand.find(c => c.id === cardId);
        if (card) handleHumanPlay(card);
      });
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TRICK AREA
// ═════════════════════════════════════════════════════════════════════════════

function renderTrickArea(state) {
  const plays = state.current_trick_plays;

  // Map seats to positions: north=top, east=right, south=bottom, west=left
  const positions = {
    north: { gridArea: 'top',    label: 'N' },
    east:  { gridArea: 'right',  label: 'E' },
    south: { gridArea: 'bottom', label: 'You' },
    west:  { gridArea: 'left',   label: 'W' },
  };

  const seatCards = {};
  for (const play of plays) {
    seatCards[play.seat] = play.card;
  }

  const slots = PLAYER_SEATS.map(seat => {
    const pos = positions[seat];
    const card = seatCards[seat];
    const cardHTML = card
      ? `<div class="card card--sm">${renderCardContent(card)}</div>`
      : `<div class="card card--sm card--empty" style="opacity:0.2;"></div>`;

    return `<div class="trick-slot trick-slot--${pos.gridArea}">
      <div style="font-size:0.7rem; color: var(--color-text-muted);">${pos.label}</div>
      ${cardHTML}
    </div>`;
  }).join('');

  return `<div class="trick-area">${slots}</div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// ROUND END SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function renderRoundEndScreen(state) {
  const lastRound = state.rounds[state.rounds.length - 1];
  if (!lastRound) return;

  const d = lastRound.deltas;
  const nsSign = d.northSouthDelta >= 0 ? '+' : '';
  const ewSign = d.eastWestDelta >= 0 ? '+' : '';

  root.innerHTML = `
    <div class="screen" style="align-items:center; justify-content:center; gap: 24px;">
      <h2 style="color: var(--color-accent-gold-lt); font-family: var(--font-display);">
        Round ${lastRound.round} Complete
      </h2>

      <div style="display:flex; gap: 32px; text-align:center;">
        <div>
          <div style="color: var(--color-text-secondary); font-size: 0.85rem;">You & North</div>
          <div style="font-size: 1.8rem; font-weight: 700; color: ${d.northSouthDelta >= 0 ? 'var(--color-success)' : 'var(--color-danger-lt)'};">
            ${nsSign}${d.northSouthDelta}
          </div>
          <div style="font-size: 0.85rem; color: var(--color-text-muted);">
            Total: ${state.scores.north_south.total} · Bags: ${state.scores.north_south.bags}
          </div>
          ${d.northSouthPenaltyApplied ? '<div style="color: var(--color-danger-lt); font-size: 0.8rem;">⚠ Bag penalty! -100</div>' : ''}
        </div>
        <div>
          <div style="color: var(--color-text-secondary); font-size: 0.85rem;">East & West</div>
          <div style="font-size: 1.8rem; font-weight: 700; color: ${d.eastWestDelta >= 0 ? 'var(--color-success)' : 'var(--color-danger-lt)'};">
            ${ewSign}${d.eastWestDelta}
          </div>
          <div style="font-size: 0.85rem; color: var(--color-text-muted);">
            Total: ${state.scores.east_west.total} · Bags: ${state.scores.east_west.bags}
          </div>
          ${d.eastWestPenaltyApplied ? '<div style="color: var(--color-danger-lt); font-size: 0.8rem;">⚠ Bag penalty! -100</div>' : ''}
        </div>
      </div>

      <div class="ray-bubble" style="max-width:300px;">
        <p class="ray-bubble__text">
          ${getRoundEndRayLine(state, d)}
        </p>
      </div>

      <button class="btn btn--primary" id="btn-next-round">Next Round</button>
      <button class="btn btn--sm" id="btn-quit">Quit</button>
    </div>
  `;

  document.getElementById('btn-next-round')?.addEventListener('click', () => handleNextRound());
  document.getElementById('btn-quit')?.addEventListener('click', renderSplash);
}

// ═════════════════════════════════════════════════════════════════════════════
// GAME OVER SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function renderGameOverScreen(state) {
  const nsTotal = state.scores.north_south.total;
  const ewTotal = state.scores.east_west.total;
  const youWon = nsTotal > ewTotal;

  root.innerHTML = `
    <div class="screen" style="align-items:center; justify-content:center; gap: 24px;">
      <div class="app-loading__spade" style="font-size: 4rem;">♠</div>
      <h1 style="font-family: var(--font-display); font-size: 2rem; color: ${youWon ? 'var(--color-success)' : 'var(--color-danger-lt)'};">
        ${youWon ? 'You Won!' : 'Game Over'}
      </h1>

      <div style="text-align:center;">
        <div style="font-size: 1.2rem; color: var(--color-text-primary);">
          You & North: ${nsTotal} · East & West: ${ewTotal}
        </div>
        <div style="color: var(--color-text-muted); margin-top: 8px;">
          ${state.rounds.length} rounds played
        </div>
      </div>

      <div class="ray-bubble" style="max-width:300px;">
        <p class="ray-bubble__text">
          ${youWon ? '"Now that\'s what I\'m talking about. You learning."' : '"It happens. Shuffle up, let\'s run it back."'}
        </p>
      </div>

      <button class="btn btn--primary" id="btn-play-again">Play Again</button>
    </div>
  `;

  document.getElementById('btn-play-again')?.addEventListener('click', renderModeSelect);
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

function renderScorePanel(state) {
  return `
    <div class="score-panel">
      <div class="score-team score-team--ns">
        <span class="score-team__name">You & N</span>
        <span class="score-team__score">${state.scores.north_south.total}</span>
        <span class="score-team__bags">${state.scores.north_south.bags} bags</span>
      </div>
      <span class="score-divider">♠</span>
      <div class="score-team score-team--ew" style="align-items:flex-end;">
        <span class="score-team__name">E & W</span>
        <span class="score-team__score">${state.scores.east_west.total}</span>
        <span class="score-team__bags">${state.scores.east_west.bags} bags</span>
      </div>
    </div>
  `;
}

function renderCardHTML(card, isIllegal, isClickable) {
  const classes = ['card'];
  if (isIllegal) classes.push('card--illegal');
  if (isClickable) classes.push('card--playable');

  return `
    <div class="${classes.join(' ')}" data-card-id="${card.id}" ${isClickable ? 'role="button" tabindex="0"' : ''}>
      ${renderCardContent(card)}
    </div>
  `;
}

function renderCardContent(card) {
  const suit = card.suit;
  const rank = cardLabel(card).replace(suitSymbol(suit), '');
  const sym = suitSymbol(suit);

  return `
    <span class="card__rank card__rank--${suit}">${rank}</span>
    <span class="card__suit card__suit--${suit}">${sym}</span>
  `;
}

function getRoundEndRayLine(state, deltas) {
  if (deltas.northSouthDelta >= 80) return '"That\'s a good hand right there. Keep it up."';
  if (deltas.northSouthDelta >= 40) return '"Solid. You played that smart."';
  if (deltas.northSouthDelta > 0) return '"You made your bid. That\'s the game."';
  if (deltas.northSouthDelta === 0) return '"Break even ain\'t bad, but it ain\'t winning."';
  if (deltas.northSouthDelta > -50) return '"That stings a little. Watch your count next time."';
  return '"Rough round. Don\'t let it get in your head."';
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDITIONAL CSS (injected for new game UI elements)
// ═════════════════════════════════════════════════════════════════════════════

const styleEl = document.createElement('style');
styleEl.textContent = `
  .hand-row {
    display: flex;
    justify-content: center;
    gap: 4px;
    flex-wrap: wrap;
    padding: 8px 4px;
  }

  .hand-row .card {
    width: 54px;
    height: 76px;
    font-size: 0.85rem;
  }

  .hand-row .card .card__rank { font-size: 0.9rem; }
  .hand-row .card .card__suit { font-size: 1.1rem; }

  .card--playable {
    cursor: pointer;
    border: 2px solid var(--color-card-legal);
  }
  .card--playable:hover {
    border-color: var(--color-card-selected);
    transform: translateY(-8px);
  }

  .bid-display {
    display: flex;
    justify-content: center;
    gap: 16px;
    padding: 8px;
  }

  .bid-display__seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(0,0,0,0.2);
    min-width: 50px;
  }

  .bid-display__seat--active {
    background: rgba(200, 148, 26, 0.2);
    border: 1px solid var(--color-accent-gold);
  }

  .bid-display__label {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .bid-display__value {
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--color-text-primary);
  }

  .bid-btn {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-surface);
    color: var(--color-text-primary);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .bid-btn:hover {
    background: var(--color-accent-gold);
    color: var(--color-bg-deep);
  }

  .bid-btn--nil {
    width: auto;
    padding: 0 12px;
    color: var(--color-nil-active);
    border-color: var(--color-nil-active);
  }

  .bid-dropdown {
    padding: 8px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-surface);
    color: var(--color-text-primary);
    font-size: 0.9rem;
  }

  .trick-area {
    display: grid;
    grid-template-areas:
      ".    top    ."
      "left center right"
      ".    bottom .";
    grid-template-columns: 1fr auto 1fr;
    grid-template-rows: auto auto auto;
    gap: 8px;
    justify-items: center;
    align-items: center;
    padding: 16px;
    min-height: 200px;
  }

  .trick-slot { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .trick-slot--top { grid-area: top; }
  .trick-slot--right { grid-area: right; }
  .trick-slot--bottom { grid-area: bottom; }
  .trick-slot--left { grid-area: left; }

  .card--sm {
    width: 48px;
    height: 68px;
    font-size: 0.75rem;
  }
  .card--sm .card__rank { font-size: 0.8rem; }
  .card--sm .card__suit { font-size: 1rem; }

  .card--empty {
    border: 1px dashed var(--color-border);
    background: transparent;
  }
`;
document.head.appendChild(styleEl);

// ═════════════════════════════════════════════════════════════════════════════
// BOOT
// ═════════════════════════════════════════════════════════════════════════════

renderSplash();
