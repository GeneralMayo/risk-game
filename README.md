# RISK — World Domination (single-player, LLM-powered)

A polished, fully local, single-player implementation of the classic board game
**RISK** with a deep-wood, parchment-and-brass aesthetic. You play the red
armies; a completely customizable AI (powered by a local LLM via Ollama — or a
built-in heuristic) plays blue.

- **Stack:** Vite + React 18 + TypeScript + Tailwind CSS + shadcn-style UI
- **AI:** local LLM over Ollama (OpenAI-compatible `/api/chat`) with a
  keyword-steered heuristic fallback.
- **State:** Zustand — fully typed, serialisable, save/load via `localStorage`.
- **Rules:** full classic RISK (42 territories, 6 continents, cards with
  escalating set bonuses, proper dice resolution, continent bonuses, conquer-
  to-draw-card, elimination win condition).
- **Verified:** ships with a developer self-play harness that ran 3 full
  AI-vs-AI games end-to-end with **zero integrity issues** (invariant checks on
  every turn: ownership, army counts, adjacency symmetry, reinforcement maths,
  card hands, win condition).

---

## Quick start

```bash
# 1. install
npm install

# 2. run dev server (opens at http://localhost:5173)
npm run dev
```

That's it. The game is playable immediately with the heuristic AI.

### Enable the LLM AI (recommended)

Install [Ollama](https://ollama.com) and pull a small instruction-tuned model:

```bash
# macOS (Homebrew)
brew install ollama

# Pull a model
ollama pull llama3.1:8b
# or any of: qwen2.5:7b, mistral:7b, gemma2:9b, phi4, ...

# Start the server (runs in the background on :11434)
ollama serve
```

Then open the **AI Strategy** panel in the game (top-right sparkle icon or
press `A`), make sure "Use local LLM" is checked, set your model name, and
click **Test connection**. Every AI decision now goes to your local model.

No internet required. No API keys. Your data never leaves your machine.

---

## What's new in the polished build

### Authentic classic-Risk world map

- **Real Risk board:** the 42 territory shapes come from the public-domain
  Wikimedia Commons `Risk_board.svg` file. Each country is an actual SVG
  `<path>` with a matching `id` (e.g. `#territory-alaska`). Paths are
  extracted at build-time into `src/data/boardSvg.ts` so the runtime stays
  fast — there's no runtime XML parsing.
- **Parchment + ocean base layers:** continents are painted over a deep
  ocean radial gradient with an animated wave pattern, then a parchment
  pattern, then a per-continent warm tint. Ownership (red / blue) is a
  translucent overlay so the continent colour always reads through.
- **3D wooden territory tokens** in player colours (red / blue) with a
  specular highlight, drop shadow and a cream-coloured troop badge with a
  dark outline — just like the real wooden chips.
- **Wood-grain sidebar panels**, leather-grain cards, **parchment battlefield
  report** log, and a brass-ringed compass rose.
- **Elegant phase banner** at the top of the map: Reinforce → Attack →
  Fortify, with a gold sheen animation and the active pill glowing.

### Dramatic battle choreography

- **3D CSS dice** with a tumbling animation when a battle resolves.
- **Battle-result pop-up** ("CONQUERED!" / dice line-up / "−1 army" counter)
  that auto-dismisses after a couple of seconds — holds longer on a
  conquest, shorter during an AI blitz.
- **Animated attack arrows** drawn between territories, plus hover / select
  / valid-target glows on every chip.

### Sound effects (optional)

Toggle with the speaker icon in the sidebar header. All sounds are synthesised
on the fly with Web Audio — no assets, works offline.

- Dice roll / dice land
- Battle hit
- Conquest fanfare
- Defeat drone
- Victory chorus
- Phase change chime
- Army placement click

### Upgraded AI Strategy panel

- **One-click presets:** Aggressive Conqueror · Defensive Turtle · Continent
  Hoarder · Chaos Agent · Balanced General.
- **Live keyword parse badges** that show which traits the heuristic detects
  in your prompt (also mirrored to the LLM).
- **Temperature slider**, model name input, Ollama URL, and a "Test
  connection" button that lists your installed models.

### Developer self-play (`?dev=true`)

Run `http://localhost:5173/?dev=true` to expose a **Dev · Self-play** button
in the sidebar. Enter N and click Run: the game plays N rounds of AI vs AI at
high speed. Every turn is checked against runtime invariants (ownership,
army counts, adjacency symmetry, card-hand sanity, reinforcement maths, turn
cap). Results appear in a table with per-game stats and any integrity issues
logged to the console too.

### Smarter LLM prompts

The JSON game state sent to the LLM is now compact (`me`/`enemy` summaries +
a frontier list of your territories with their weakest enemy neighbour
pre-computed) instead of dumping the full territory graph on every call.
Shorter prompts = faster, more decisive moves.

---

## Keyboard shortcuts

| Key          | Action                          |
| ------------ | ------------------------------- |
| `Esc`        | Deselect territory              |
| `Space` / `Enter` | End current phase          |
| `?`          | Toggle help modal               |
| `A`          | Toggle AI Strategy panel        |
| `C`          | Open your cards                 |
| `N`          | New game (with confirm prompt)  |
| `S` (dev mode) | Open Self-Play                |

---

## Customize the AI

Paste **any** natural-language system prompt into the AI Strategy panel. Four
presets are shipped:

> **Aggressive Conqueror** — attacks whenever it has any edge, prioritises
> elimination over bonuses, always trades cards.

> **Defensive Turtle** — only attacks at +3 armies or to complete a continent,
> fortifies threatened borders, holds cards until forced.

> **Continent Hoarder** — grabs Australia/South America first, reinforces
> continent chokepoints, never surrenders a held continent.

> **Chaos Agent** — unpredictable, occasionally suicidal attacks, targets
> the strongest enemy territory to break fronts.

> **Balanced General** — the default; plays a measured, classic game.

### Temperature

`temperature: 0.0–0.3` → consistent, rational play.
`temperature: 0.6–1.0` → wilder, more personality-driven moves.

---

## Project layout

```
src/
├─ ai/
│  ├─ AI.ts                 LLM + heuristic AI orchestrator (player-agnostic)
│  └─ selfPlay.ts           AI-vs-AI self-play harness with invariant checks
├─ components/
│  ├─ ui/                   Reusable shadcn-style primitives
│  ├─ Board.tsx             SVG world map (continent paths, ocean, chips)
│  ├─ Territory.tsx         3D wooden territory token
│  ├─ Sidebar.tsx           Wood/leather sidebar with parchment log
│  ├─ PhaseBanner.tsx       Glowing Reinforce → Attack → Fortify banner
│  ├─ BattleResultDialog.tsx   3D dice, dramatic pop-up
│  ├─ AttackDialog.tsx      Pre-battle dice selector + Blitz
│  ├─ FortifyDialog.tsx     Army movement modal
│  ├─ ConquerDialog.tsx     "Advance armies" after conquest
│  ├─ CardsDialog.tsx       View/trade RISK cards
│  ├─ AIConfigDialog.tsx    AI Strategy (presets, prompt, model)
│  ├─ HelpDialog.tsx        Rules summary
│  └─ SelfPlayDialog.tsx    Dev-mode self-play results table
├─ data/
│  ├─ board.ts              42 territories + adjacencies + SVG-derived coords
│  ├─ boardSvg.ts           AUTO-GENERATED territory paths from Wikimedia SVG
│  └─ types.ts              Shared TypeScript types
├─ lib/
│  ├─ GameLogic.ts          Pure rule engine
│  ├─ sound.ts              Web-Audio SFX
│  └─ utils.ts              `cn()` Tailwind helper
├─ state/
│  └─ gameStore.ts          Zustand store (full game state + actions)
├─ styles/index.css         Tailwind + wood / leather / parchment classes
├─ App.tsx
└─ main.tsx
```

---

## Rules implemented

- **42 territories across 6 continents** with canonical adjacencies (including
  the Kamchatka ↔ Alaska wrap).
- **Continent bonuses:** NA +5, SA +2, EU +5, AF +3, AS +7, AU +2.
- **Setup:** territories auto-dealt; each player has 40 starting armies and
  alternates placing one army at a time.
- **Reinforcement:** `max(3, floor(territories / 3))` + continent bonuses +
  card trades.
- **Attack:** 1–3 attacking dice, 1–2 defending dice, classic high-vs-high
  comparison, ties to defender. Blitz supported. Draw a card on any
  successful conquest (max 1/turn).
- **Fortify:** move any number of armies between two adjacent owned
  territories (single move). Ends turn.
- **Cards:** 42 territory cards + 2 Wilds. Sets trade for escalating bonuses:
  4, 6, 8, 10, 12, 15, +5 each after. +2 bonus placed on an owned territory
  pictured on a traded card. Forced trade at ≥ 5 cards.
- **Win condition:** eliminate the opponent.

---

## Troubleshooting

**"AI is thinking…" forever.** Ollama may be slow on a cold model. Try a
smaller model (`llama3.2:3b`) or toggle off LLM in the AI Strategy panel.

**LLM returns invalid JSON.** The game silently falls back to the heuristic
for that decision. If this happens a lot, lower the temperature and pick a
stronger model.

**CORS errors calling Ollama.** Ollama allows `http://localhost` by default.
If you're hosting the frontend elsewhere, start Ollama with
`OLLAMA_ORIGINS='*' ollama serve`.

**Labels overlap chips.** That's by design — continent names are painted
*behind* the tokens, like a real board game, so the chips occlude them
slightly where they sit.

---

## Regenerating the map

`src/data/boardSvg.ts` is a build artefact — it contains the 42 territory path
strings plus bounding boxes, extracted from the Wikimedia Risk board SVG.
Re-generate it any time with:

```bash
curl -s -L -o /tmp/risk_board.svg \
  "https://upload.wikimedia.org/wikipedia/commons/4/4a/Risk_board.svg"
node scripts/extract_risk.mjs  # writes src/data/boardSvg.ts
```

(The extraction script normalises the SVG's `yakursk` typo to `yakutsk` and
applies the countries-group translate so centroids live in the root viewBox.)

## Using the real shadcn CLI

This project uses the shadcn **pattern** (Radix + CVA + Tailwind) but bundles
its own copies of the primitives under `src/components/ui/` so the app builds
without running the CLI. If you want to extend it:

```bash
npx shadcn@latest init --yes --defaults
npx shadcn@latest add button dialog card badge input textarea tooltip tabs
```

The existing files in `src/components/ui/` match the CLI-generated signatures.

---

## Tips for best visuals

- Play fullscreen at 1440p or wider for the nicest board proportions.
- Enable sound (speaker toggle) for dice and battle effects.
- Keep DevTools closed during an AI turn — the drop-shadow + displacement
  filters on the continents hit the GPU hardest during panel transitions.

---

## License

MIT — have fun.
