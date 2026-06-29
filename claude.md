# Spades with Uncle Ray — Project Context for Claude

Paste this file's contents at the top of any new Claude chat to get full context instantly.
Fetch live from GitHub if needed: `https://raw.githubusercontent.com/aperryman83/spades-app/main/CLAUDE.md`

---

## Project basics

- **App:** Spades with Uncle Ray — a beginner-friendly Spades card game with an AI coach
- **Repo:** `aperryman83/spades-app` on GitHub
- **Deployed:** Replit (`replit.com/@azellayperryman/spades-app`)
- **Stack:** Vanilla JS ES modules, Node.js static file server + Anthropic API proxy

---

## Key files

| File | Purpose |
|------|---------|
| `app.js` | All UI — hand tray, trick area, Ray panel, screen rendering (~31k chars) |
| `server.js` | Node static server + `/api/ray` proxy to Anthropic API |
| `coach/coachState.js` | Ray's logic — conversation state, API calls, trigger detection |
| `coach/rayPrompt.js` | Ray's personality — system prompt builder |
| `coach/lines.js` | Ray's voice example lines by category |
| `engine/` | Pure game logic (Vault) — no UI, no Ray |

---

## Architecture: Three-Room House

- **Vault** (`engine/`) — pure game logic. No UI, no AI, no side effects.
- **Stage** (`app.js`) — UI layer. Reads state, renders, wires events.
- **Porch** (`coach/`) — Ray/AI coach. READ-ONLY. Never mutates game state. Ever.

Layout constants:
- `HAND_TRAY_HEIGHT = 200` drives all layout math
- Desktop (≥760px): Ray panel is always-visible 320px right sidebar
- Mobile (<760px): Ray panel is bottom drawer

---

## AI model split

- **Claude Sonnet** (`claude-sonnet-4-6`) — opening/teaching moments (Ray initiates)
- **Claude Haiku** (`claude-haiku-4-5-20251001`) — follow-up chat (player replies)
- API key: stored in Replit Secrets as `ANTHROPIC_API_KEY` — never put in chat or code
- `max_tokens: 500` in server.js

---

## Ray's personality rules (critical)

- Ray is the player's **PARTNER** — warm, direct, teaches with love
- **HARD RULE:** NEVER call the player "motherfucka," "motherfucker," or any variant — not in passing, not casually. That word is for opponents and situations only.
- Acceptable profanity: damn, shit, sheeeeit, hell, ass, motherfucka (opponents/situations ONLY)
- Profanity maybe 1 in 5 lines — rare so it lands harder
- Economy of words during play (1-3 sentences). Longer teaching between rounds only.
- "We" not "you" — partnership framing
- Never mocks the player as a person, only the play

---

## Process rules for working with Claude

- **Show diffs only** — Azella pastes them manually into Replit's editor
- **Never use CM6 base64 injection** — proved unreliable, corrupted rayPrompt.js once
- After any edit: `git add [file] && git commit -m "description" && git push`
- If push is rejected after a rebase: `git push origin main --force`
- Always verify GitHub matches Replit with `git log --oneline -5` + `git status`

---

## Git/history notes

- History has been force-pushed a few times due to Replit agent corruption incidents
- If histories diverge: rebase Replit onto GitHub, resolve conflicts, force push
- In a rebase: `--ours` = base being rebased onto, `--theirs` = your commits being replayed

---

## Features built so far

- [x] Full Spades game engine (4 players, bidding, trick-taking, scoring)
- [x] Uncle Ray AI coach with teaching moments and follow-up chat
- [x] Persistent Ray chat panel (desktop sidebar / mobile drawer)
- [x] Split model: Sonnet for teaching, Haiku for chat
- [x] Beginner flow with guided bidding
- [x] Bot delays tuned for natural pacing
- [ ] Ask Ray mode toggle (tap card → ask Ray instead of play)
- [ ] Trick winner flash in bid summary

---

## When to update this file

Update and commit `CLAUDE.md` when:
- A new file is added to the project
- An architecture decision is made
- A new process rule is established
- Ray's personality rules change
- A major feature ships (move from [ ] to [x])
- A new AI model or API change is made

---

## Starting a new Claude chat

1. Fetch this file or paste its contents at the top
2. Add one line about what you're working on today
3. Claude can fetch any file directly from GitHub to get current code

Example opener:
> "I'm building Spades with Uncle Ray — context in CLAUDE.md above. Today I want to [feature]. Here's the relevant file: [paste or fetch it]."
