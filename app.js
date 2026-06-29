/**
 * app.js
 *
 * Single entry point. index.html loads only this file.
 * Handles: splash screen, mode select, and wiring the game UI
 * to the game controller.
 *
 * Layout — three fixed zones stacked from the bottom:
 *   #hand-tray    — player's cards, always pinned to bottom (z-index 100)
 *   #ray-panel    — Uncle Ray's chat, sits just above the hand tray (z-index 50)
 *   #game-content — everything else, padded so it never hides behind either
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
  askRay,
} from './controller/gameController.js';
// ── Coach (Uncle Ray) ─────────────────────────────────────────────────────────
import {
  getActiveConversation,
  sendPlayerMessage,
  dismissConversation,
  isConversationActive,
} from './coach/coachState.js';
// ── Utils ─────────────────────────────────────────────────────────────────────
import logger from './utils/logger.js';
import { MODE_LABELS } from './utils/helpers.js';

// ═════════════════════════════════════════════════════════════════════════════
// LAYOUT CONSTANTS
// Hand tray is a fixed 200px tall zone at the very bottom.
// Ray panel sits directly above it.
// ═════════════════════════════════════════════════════════════════════════════
const HAND_TRAY_HEIGHT = 200; // px — enough for 2 card rows + label + padding

// ═════════════════════════════════════════════════════════════════════════════
// MODULE STATE
// ═════════════════════════════════════════════════════════════════════════════
const root = document.getElementById('app-root');
let gameContentEl = null;
let rayPanelEl    = null;
let handTrayEl    = null;

let rayPanelVisible  = false;  // X hides panel but keeps conversation alive
let lastShownConvoId = null;   // auto-shows panel when a new Ray message fires

// Stored so card-click handlers can reference the live hand after render
let _currentHand       = [];
let _currentLegalCards = [];
let askRayModeOn       = false;  // when ON, card tap asks Ray instead of playing
let _lastTrickWinner   = null;   // seat that just won a trick; cleared after flash
let _prevTricksWon     = {};     // snapshot used to detect new trick wins

// ═════════════════════════════════════════════════════════════════════════════
// LAYOUT INIT — three persistent fixed zones
// ═════════════════════════════════════════════════════════════════════════════
function initLayout() {
  root.innerHTML = `
    <div id="game-content"></div>
    <div id="ray-panel"></div>
    <div id="hand-tray"></div>
  `;
  gameContentEl = document.getElementById('game-content');
  rayPanelEl    = document.getElementById('ray-panel');
  handTrayEl    = document.getElementById('hand-tray');
}

// ═════════════════════════════════════════════════════════════════════════════
// HAND TRAY — fixed at the bottom, always visible during play
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Renders the player's hand into the fixed #hand-tray element.
 * Pass null to hide the tray (splash / mode-select / round-end screens).
 *
 * @param {Array|null} hand       — sorted card array, or null to hide
 * @param {Array}      legalCards — cards the player can legally play right now
 * @param {boolean}    isMyTurn   — whether it's currently the human's turn
 * @param {string}     label      — status label above the cards
 */
function updateHandTray(hand, legalCards = [], isMyTurn = false, label = 'Your Hand') {
  if (!handTrayEl) return;

  if (!hand || hand.length === 0) {
    handTrayEl.classList.remove('hand-tray--visible');
    handTrayEl.innerHTML = '';
    return;
  }

  _currentHand       = hand;
  _currentLegalCards = legalCards;

  const handHTML = hand.map(card => {
    const isLegal   = legalCards.length === 0 || legalCards.some(c => c.id === card.id);
    const isIllegal = isMyTurn && !isLegal;
    const clickable  = isMyTurn && isLegal;
    return renderCardHTML(card, isIllegal, clickable);
  }).join('');

  const labelColor = isMyTurn
    ? 'var(--color-accent-gold-lt)'
    : 'var(--color-text-muted)';
  const labelWeight = isMyTurn ? '600' : '400';

  const askRayBtnHTML = isMyTurn ? `
    <button
      id="ask-ray-toggle"
      class="btn btn--ray btn--ray-toggle${askRayModeOn ? ' btn--ray-toggle--on' : ''}"
    >${askRayModeOn ? '🟡 Asking Ray' : '♠ Ask Ray'}</button>
  ` : '';

  handTrayEl.innerHTML = `
    <div class="hand-tray__top-row">
      <div class="hand-tray__label" style="color:${labelColor}; font-weight:${labelWeight};">
        ${label}
      </div>
      ${askRayBtnHTML}
    </div>
    <div class="hand-row" id="hand-row-cards">${handHTML}</div>
  `;
  handTrayEl.classList.add('hand-tray--visible');

  // Wire Ask Ray toggle
  document.getElementById('ask-ray-toggle')?.addEventListener('click', () => {
    askRayModeOn = !askRayModeOn;
    const btn = document.getElementById('ask-ray-toggle');
    if (btn) {
      btn.textContent = askRayModeOn ? '🟡 Asking Ray' : '♠ Ask Ray';
      btn.classList.toggle('btn--ray-toggle--on', askRayModeOn);
    }
  });

  // Wire card clicks
  if (isMyTurn) {
    handTrayEl.querySelectorAll('.card[data-card-id]').forEach(el => {
      if (el.classList.contains('card--illegal')) return;
      el.addEventListener('click', async () => {
        const cardId = el.dataset.cardId;
        const card = _currentHand.find(c => c.id === cardId);
        if (!card) return;
        if (askRayModeOn) {
          if (!isConversationActive()) await askRay();
          const suitNames = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
          const rank = cardLabel(card).replace(suitSymbol(card.suit), '');
          const suit = suitNames[card.suit] || card.suit;
          await sendPlayerMessage(`Should I play the ${rank} of ${suit}?`, getState());
          updateRayPanel();
        } else {
          handleHumanPlay(card);
        }
      });
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// RAY PANEL — persistent chat drawer, sits above the hand tray
// ═════════════════════════════════════════════════════════════════════════════
function updateRayPanel() {
  if (!rayPanelEl) return;
  const isDesktop = window.innerWidth >= 760;
  const convo = getActiveConversation();

  // On desktop: always show the panel (even without a conversation)
  if (isDesktop) {
    rayPanelEl.classList.add('ray-panel--active');
  }

  // Auto-show on mobile whenever Ray fires a new teaching moment
  if (convo && convo.id !== lastShownConvoId) {
    rayPanelVisible  = true;
    lastShownConvoId = convo.id;
    if (!isDesktop) rayPanelEl.classList.add('ray-panel--active');
  }

  // Build messages HTML (or placeholder if no conversation yet)
  let messagesHTML = '';
  if (convo && convo.isActive) {
    messagesHTML = convo.messages.map(m => {
      const formatted = m.content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .split(/\n\n+/)
        .map(para => para.trim())
        .filter(para => para.length > 0)
        .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
        .join('');
      return `<div class="ray-chat-msg ray-chat-msg--${m.role === 'assistant' ? 'ray' : 'player'}">${formatted}</div>`;
    }).join('');
  } else if (isDesktop) {
    messagesHTML = `<div class="ray-placeholder">Ask me anything — your hand, what to bid, why something happened.</div>`;
  } else {
    // Mobile with no active conversation — hide panel
    if (!rayPanelVisible) {
      rayPanelEl.classList.remove('ray-panel--active');
      rayPanelEl.innerHTML = '';
      return;
    }
  }

  // Dismiss button: only shown on mobile (desktop panel is always open)
  const dismissBtn = isDesktop ? '' :
    `<button class="ray-dismiss-btn" id="ray-dismiss" title="Minimize">✕</button>`;

  rayPanelEl.innerHTML = `
    <div class="ray-chat-header">
      <span class="ray-chat-header__name">♠ Uncle Ray</span>
      ${dismissBtn}
    </div>
    <div class="ray-chat-messages" id="ray-messages">${messagesHTML}</div>
    <div class="ray-chat-input-row">
      <input
        class="ray-chat-input"
        id="ray-input"
        type="text"
        placeholder="Ask Uncle Ray..."
        autocomplete="off"
      />
      <button class="btn btn--sm" id="ray-send">Send</button>
    </div>
  `;

  const msgs = document.getElementById('ray-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;

  document.getElementById('ray-dismiss')?.addEventListener('click', () => {
    rayPanelVisible = false;
    rayPanelEl.classList.remove('ray-panel--active');
    rayPanelEl.innerHTML = '';
  });

  const input   = document.getElementById('ray-input');
  const sendBtn = document.getElementById('ray-send');

  async function sendMessage() {
    const text = input?.value?.trim();
    if (!text) return;
    if (input) input.value = '';
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '...'; }
    // Auto-start a conversation if one isn't active
    if (!isConversationActive()) {
      await askRay();
    }
    await sendPlayerMessage(text, getState());
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
    updateRayPanel();
  }

  sendBtn?.addEventListener('click', sendMessage);
  input?.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
  if (isDesktop) setTimeout(() => input?.focus(), 50);
}

// ═════════════════════════════════════════════════════════════════════════════
// SPLASH SCREEN
// ═════════════════════════════════════════════════════════════════════════════
function renderSplash() {
  updateHandTray(null); // hide hand tray on non-game screens
  gameContentEl.innerHTML = `
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
  updateHandTray(null);
  const modeButtons = Object.entries(MODE_LABELS).map(([mode, labels]) => `
    <button class="mode-btn" data-mode="${mode}">
      <div class="mode-btn__title">${labels.title}</div>
      <div class="mode-btn__desc">${labels.description}</div>
      <div class="mode-btn__ray">${labels.rayLine}</div>
    </button>
  `).join('');
  gameContentEl.innerHTML = `
    <div class="screen" style="justify-content: center; gap: 24px;">
      <h2 style="text-align:center; font-size: 1.5rem; color: var(--color-accent-gold-lt);">
        How do you want to play?
      </h2>
      <div class="mode-select">${modeButtons}</div>
      <button class="btn btn--sm" id="btn-back">← Back</button>
    </div>
  `;
  gameContentEl.querySelectorAll('.mode-btn').forEach(btn => {
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

  // Detect trick winner: one seat's trick count went up since last render
  if (state.status === GAME_PHASE.PLAYING && Object.keys(_prevTricksWon).length > 0) {
    for (const seat of PLAYER_SEATS) {
      if ((state.tricks_won[seat] || 0) > (_prevTricksWon[seat] || 0)) {
        _lastTrickWinner = seat;
        setTimeout(() => { _lastTrickWinner = null; }, 1200);
        break;
      }
    }
  }
  if (state.status === GAME_PHASE.PLAYING) {
    _prevTricksWon = { ...state.tricks_won };
  }

  switch (state.status) {
    case GAME_PHASE.BIDDING:   renderBiddingScreen(state);  break;
    case GAME_PHASE.PLAYING:   renderPlayingScreen(state);  break;
    case GAME_PHASE.ROUND_END: renderRoundEndScreen(state); break;
    case GAME_PHASE.GAME_OVER: renderGameOverScreen(state); break;
    default: renderBiddingScreen(state);
  }
  updateRayPanel();
}

// ═════════════════════════════════════════════════════════════════════════════
// BIDDING SCREEN
// ═════════════════════════════════════════════════════════════════════════════
function renderBiddingScreen(state) {
  const hand     = sortHand(state.hands[HUMAN_SEAT], state);
  const isMyTurn = state.current_turn === HUMAN_SEAT;

  // Hand goes into the fixed tray — never inside the scroll area
  updateHandTray(hand, [], false, 'Your Hand');

  const bidDisplay = PLAYER_SEATS.map(seat => {
    const bid     = state.bids[seat];
    const label   = seat === HUMAN_SEAT ? 'You (S)' : seat.charAt(0).toUpperCase();
    const bidText = bid === null ? '...' : bid === 0 ? 'NIL' : bid;
    const isActive = state.current_turn === seat;
    return `<div class="bid-display__seat ${isActive ? 'bid-display__seat--active' : ''}">
      <span class="bid-display__label">${label}</span>
      <span class="bid-display__value">${bidText}</span>
    </div>`;
  }).join('');

  let bidButtonsHTML = '';
  if (isMyTurn) {
    const buttons = [`<button class="bid-btn bid-btn--nil" data-bid="0">NIL</button>`];
    for (let i = 1; i <= 7; i++) {
      buttons.push(`<button class="bid-btn" data-bid="${i}">${i}</button>`);
    }
    buttons.push(`<select class="bid-dropdown" id="bid-high">
      <option value="">8+</option>
      ${[8,9,10,11,12,13].map(n => `<option value="${n}">${n}</option>`).join('')}
    </select>`);
    bidButtonsHTML = `<div class="bid-selector">${buttons.join('')}</div>`;
  } else {
    bidButtonsHTML = `
      <div style="text-align:center; padding: 16px; color: var(--color-text-secondary);">
        Waiting for ${state.current_turn} to bid...
      </div>
    `;
  }

  gameContentEl.innerHTML = `
    <div class="screen card-table game-screen-padded" style="padding: 16px; gap: 12px;">
      ${renderScorePanel(state)}
      <div style="text-align:center; color: var(--color-accent-gold-lt); font-size: 1.1rem; font-weight: 600;">
        Round ${state.current_round} — Bidding
      </div>
      <div class="bid-display">${bidDisplay}</div>
      ${bidButtonsHTML}
    </div>
  `;

  if (isMyTurn) {
    gameContentEl.querySelectorAll('.bid-btn').forEach(btn => {
      btn.addEventListener('click', () => handleHumanBid(parseInt(btn.dataset.bid, 10)));
    });
    const dropdown = document.getElementById('bid-high');
    dropdown?.addEventListener('change', () => {
      const val = parseInt(dropdown.value, 10);
      if (!isNaN(val)) handleHumanBid(val);
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PLAYING SCREEN
// ═════════════════════════════════════════════════════════════════════════════
function renderPlayingScreen(state) {
  const hand       = sortHand(state.hands[HUMAN_SEAT], state);
  const legalCards = getHumanLegalCards();
  const isMyTurn   = state.current_turn === HUMAN_SEAT;

  // Hand goes into the fixed tray
  const turnLabel = isMyTurn
    ? 'Your turn — tap a card'
    : `Waiting for ${state.current_turn}...`;
  updateHandTray(hand, legalCards, isMyTurn, turnLabel);

  const trickHTML  = renderTrickArea(state);
  const bidSummary = PLAYER_SEATS.map(seat => {
    const label    = seat === HUMAN_SEAT ? 'You' : seat.charAt(0).toUpperCase();
    const bid      = state.bids[seat] === 0 ? 'NIL' : state.bids[seat];
    const tricks   = state.tricks_won[seat];
    const isWinner = seat === _lastTrickWinner;
    return `<span style="margin: 0 6px;"${isWinner ? ' class="trick-winner-flash"' : ''}>${label}: ${bid}(${tricks})</span>`;
  }).join('');

  gameContentEl.innerHTML = `
    <div class="screen card-table game-screen-padded" style="padding: 12px; gap: 8px;">
      ${renderScorePanel(state)}
      <div style="text-align:center; font-size: 0.85rem; color: var(--color-text-secondary);">
        ${bidSummary}
      </div>
      <div style="text-align:center; font-size: 0.75rem; color: var(--color-text-muted);">
        Trick ${Math.min(state.current_trick, 13)} of 13
        ${state.spades_broken ? ' · ♠ Broken' : ''}
      </div>
      ${trickHTML}
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════════════════════
// TRICK AREA
// ═════════════════════════════════════════════════════════════════════════════
function renderTrickArea(state) {
  const plays = state.current_trick_plays;
  const positions = {
    north: { gridArea: 'top',    label: 'N' },
    east:  { gridArea: 'right',  label: 'E' },
    south: { gridArea: 'bottom', label: 'You' },
    west:  { gridArea: 'left',   label: 'W' },
  };
  const seatCards = {};
  for (const play of plays) seatCards[play.seat] = play.card;

  const slots = PLAYER_SEATS.map(seat => {
    const pos  = positions[seat];
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
  updateHandTray(null);
  const lastRound = state.rounds[state.rounds.length - 1];
  if (!lastRound) return;
  const d      = lastRound.deltas;
  const nsSign = d.northSouthDelta >= 0 ? '+' : '';
  const ewSign = d.eastWestDelta   >= 0 ? '+' : '';
  gameContentEl.innerHTML = `
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
  updateHandTray(null);
  const nsTotal = state.scores.north_south.total;
  const ewTotal = state.scores.east_west.total;
  const youWon  = nsTotal > ewTotal;
  gameContentEl.innerHTML = `
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
  if (isIllegal)  classes.push('card--illegal');
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
  const sym  = suitSymbol(suit);
  return `
    <span class="card__rank card__rank--${suit}">${rank}</span>
    <span class="card__suit card__suit--${suit}">${sym}</span>
  `;
}

// ═════════════════════════════════════════════════════════════════════════════
// CSS — injected once at boot
// ═════════════════════════════════════════════════════════════════════════════
const styleEl = document.createElement('style');
styleEl.textContent = `
  /* ── Three-zone fixed layout ────────────────────────────────────────────── */

  /* Game content: capped height, scrollable so bid buttons stay reachable */
  #game-content {
    width: 100%;
    height: calc(100vh - ${HAND_TRAY_HEIGHT}px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* Screens inside game-content need to be at least as tall as the container */
  #game-content .screen {
    min-height: calc(100vh - ${HAND_TRAY_HEIGHT}px);
    height: auto;
  }

  /* Extra bottom padding so bid buttons clear the Ray panel when it's open */
  .game-screen-padded {
    padding-bottom: calc(32vh + 24px) !important;
    box-sizing: border-box;
  }

  /* ── Hand Tray — pinned to absolute bottom, always on top ───────────────── */
  #hand-tray {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: ${HAND_TRAY_HEIGHT}px;
    background: var(--color-bg-deep);
    border-top: 1px solid var(--color-border);
    z-index: 100;
    display: none;          /* hidden until a hand is loaded */
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6px 4px 8px;
  }
  #hand-tray.hand-tray--visible {
    display: flex;
  }
  .hand-tray__label {
    font-size: 0.75rem;
    margin-bottom: 6px;
    text-align: center;
  }

  /* ── Ray Panel — sits directly above the hand tray ──────────────────────── */
  #ray-panel {
    position: fixed;
    bottom: ${HAND_TRAY_HEIGHT}px;   /* top of the hand tray */
    left: 0;
    right: 0;
    max-height: 0;
    overflow: hidden;
    background: var(--color-bg-deep);
    /* border only appears when panel is open — avoids ghost line on splash */
    border-top: none;
    border-bottom: none;
    z-index: 50;
    display: flex;
    flex-direction: column;
    transition: max-height 0.3s ease;
  }
  #ray-panel.ray-panel--active {
    max-height: 20vh;
    border-top: 2px solid var(--color-accent-gold);
    border-bottom: 1px solid rgba(200, 148, 26, 0.25);
  }

  /* ── Ray chat internals ──────────────────────────────────────────────────── */
  .ray-chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    border-bottom: 1px solid rgba(200, 148, 26, 0.3);
    flex-shrink: 0;
  }
  .ray-chat-header__name {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-accent-gold-lt);
    letter-spacing: 0.04em;
  }
  .ray-dismiss-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 1rem;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: color 0.15s;
  }
  .ray-dismiss-btn:hover { color: var(--color-text-primary); }
  .ray-chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }
  .ray-chat-msg {
    max-width: 92%;
    padding: 8px 12px;
    border-radius: 12px;
    font-size: 0.83rem;
    line-height: 1.5;
  }
  .ray-chat-msg--ray {
    background: rgba(200, 148, 26, 0.12);
    border: 1px solid rgba(200, 148, 26, 0.35);
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }
  .ray-chat-msg--ray::before {
    content: 'Uncle Ray';
    display: block;
    font-size: 0.68rem;
    color: var(--color-accent-gold-lt);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 3px;
  }
  .ray-chat-msg--player {
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.1);
    align-self: flex-end;
    border-bottom-right-radius: 4px;
  }
  .ray-chat-input-row {
    display: flex;
    padding: 8px 12px;
    gap: 8px;
    border-top: 1px solid var(--color-border);
    align-items: center;
    flex-shrink: 0;
  }
  .ray-chat-input {
    flex: 1;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 20px;
    color: var(--color-text-primary);
    padding: 8px 14px;
    font-size: 0.85rem;
    outline: none;
    font-family: inherit;
  }
  .ray-chat-input:focus { border-color: var(--color-accent-gold); }

  /* ── Talk to Ray button ──────────────────────────────────────────────────── */
  .btn--ray {
    background: rgba(200, 148, 26, 0.15);
    border: 1px solid var(--color-accent-gold);
    color: var(--color-accent-gold-lt);
    font-size: 0.78rem;
    padding: 6px 14px;
  }
  .btn--ray:hover { background: rgba(200, 148, 26, 0.3); }

  /* ── Hand cards ──────────────────────────────────────────────────────────── */
  .hand-row {
    display: flex;
    justify-content: center;
    gap: 4px;
    flex-wrap: wrap;
    padding: 0 4px;
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

  /* ── Bidding ─────────────────────────────────────────────────────────────── */
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

  /* ── Trick Area ──────────────────────────────────────────────────────────── */
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
  .trick-slot--top    { grid-area: top; }
  .trick-slot--right  { grid-area: right; }
  .trick-slot--bottom { grid-area: bottom; }
  .trick-slot--left   { grid-area: left; }
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

  /* ── Desktop: Ray panel as always-visible right sidebar (≥ 760px) ──────── */
  @media (min-width: 760px) {
    /* Right column — always visible, no fade/hide */
    #ray-panel {
      top: 0;
      bottom: 0 !important;
      right: 0;
      left: auto !important;
      width: 320px;
      max-height: 100vh !important;
      overflow-y: auto;
      border-left: 2px solid var(--color-accent-gold) !important;
      border-top: none !important;
      border-bottom: none !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      transition: none;
    }
    #ray-panel.ray-panel--active {
      opacity: 1 !important;
      pointer-events: auto !important;
    }
    /* Game content fills the column left of the sidebar, centered */
    #game-content {
      width: calc(100vw - 320px) !important;
      max-width: none !important;
      height: 100vh !important;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    /* Cap the game table width so it doesn't stretch on wide screens */
    #game-content .screen {
      width: 100%;
      max-width: 700px;
    }
    /* Override any max-width on #app-root set by style.css */
    #app-root {
      max-width: none !important;
    }
    /* Hand tray stops at the left edge of Ray's column */
    #hand-tray {
      right: 320px !important;
    }
    /* Bottom padding only needs to clear the hand tray height, not Ray panel */
    .game-screen-padded {
      padding-bottom: ${HAND_TRAY_HEIGHT + 16}px !important;
    }
  }

  /* ── Hand tray top row (label + Ask Ray toggle) ──────────────────────────── */
  .hand-tray__top-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 4px;
    width: 100%;
  }
  .hand-tray__top-row .hand-tray__label {
    margin-bottom: 0;
  }
  .btn--ray-toggle {
    font-size: 0.7rem;
    padding: 4px 10px;
    opacity: 0.65;
    transition: opacity 0.2s, background 0.2s, box-shadow 0.2s;
  }
  .btn--ray-toggle--on {
    opacity: 1;
    background: rgba(200, 148, 26, 0.3);
    box-shadow: 0 0 8px rgba(200, 148, 26, 0.4);
  }

  /* ── Trick winner flash ───────────────────────────────────────────────────── */
  @keyframes trickWinFlash {
    0%   { font-weight: 700; color: var(--color-accent-gold-lt); }
    70%  { font-weight: 700; color: var(--color-accent-gold-lt); }
    100% { font-weight: 400; color: var(--color-text-secondary); }
  }
  .trick-winner-flash {
    animation: trickWinFlash 1.2s ease-out forwards;
  }
`;
document.head.appendChild(styleEl);

// ═════════════════════════════════════════════════════════════════════════════
// BOOT
// ═════════════════════════════════════════════════════════════════════════════
initLayout();
renderSplash();