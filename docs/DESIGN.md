# SAYSO design system

How SAYSO looks, moves and sounds. Product rules and screen contents live in [PRD](PRD.md) sections 6 and 8; the stack lives in [ARCHITECTURE](technical/ARCHITECTURE.md) section 9. Values here are the source for `apps/web/src/styles/tokens.css`; change both in one commit.

## 1. Direction

A toy-box game show starring the SaySo mascot: the red speech bubble with the winking face. The page should make a judge say "wow" in the first second and make a player want to press everything. Warm paper, white sticker cards with ink outlines, big chunky 3D voxel objects that float, follow the cursor and roll when touched, a sticker book of 29 voxel illustrations, pastel colour blocks, and one red that belongs to the mascot and to the moment a word is SAID.

It must never look like a trading terminal, a generic dashboard or a phone screen stretched onto a desktop. Every screen has a real phone layout and a real desktop layout.

## 2. Colour

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FDFBF4` | Page background (sampled from the logo) |
| `card` | `#FFFFFF` | Sticker cards, sheets, inputs |
| `ink` | `#0A0A0A` | Text, outlines, hard shadows |
| `ink-soft` | `#55524A` | Secondary text |
| `line` | `#E8E3D6` | Hairlines inside cards |
| `said` / `said-deep` / `said-tint` | `#FD2224` / `#D4101A` / `#FFE3E1` | Mascot, landing primary CTA, SAID card, LIVE pill |
| `gain` / `gain-bright` / `gain-tint` | `#0B7A3B` / `#22C55E` / `#DCF7E5` | Profit text / fills / backgrounds, YES settled |
| `no` | `#8F8A7E` | NO settled, losses, disabled |
| `sun` / `sun-tint` | `#FACC15` / `#FFF4C2` | Highlights, streaks, section blocks |
| `sky` / `sky-tint` | `#4F52E8` / `#E2E4FF` | Focus ring, info, section blocks |
| `bubble` / `bubble-tint` | `#FF7EB3` / `#FFE2EE` | Fun accents, section blocks |
| `mint-tint` | `#D9F6E8` | Section blocks |

Rules:
- Body text on `said` is `ink` or white at ≥ 24 px bold only (white 3.9:1 passes AA large).
- In the game (S1–S8), red still means SAID or LIVE; losses are neutral, never red.
- Pastel tints colour whole landing sections and illustration plates; never put body text on a saturated accent.
- No dark-purple gradients, neon or glassmorphism. Soft shadows are allowed under floating 3D and large cards (`shadow-soft`).

## 3. Type

| Role | Face | Setting |
|---|---|---|
| Display, board words, numbers that matter | Plus Jakarta Sans Variable | weight 800, tracking −0.035 em (`font-headline`) |
| Body, UI | Inter Variable | 400/500/600; 16–18 px body, line-height 1.5 |
| Numbers | either face with `tnum` (`tabular`) | Prices in cents ("62¢"), balances with 2 decimals |

Two families, both OFL, self-hosted through `@fontsource-variable`. Desktop headlines run 88–128 px; phone headlines 44–56 px; use `clamp()`.

## 4. Shape and depth

- Sticker card: `card` fill, 2 px `ink` border, 24 px radius, hard shadow `0 4px 0 ink`; large hero cards `0 8px 0 ink`. Press: down 3 px, shadow collapses; hover (fine pointers): up 2 px.
- Pills (buttons, tags): 999 px radius, same border and shadow. Landing primary CTA is `said` red with white bold text; app primary is `ink`; secondary is white.
- Sheets: 32 px top radius on phones; on desktop the ticket is a docked side panel.
- Spacing scale 4 px. Fluid full-width shell: gutters 24 px on phones, 32 px at 768, 48 px at 1024+. Headers and app bars span the viewport (logo flush to the left gutter, primary action flush to the right); section content max width 1520 px; the landing hero is full-bleed.

## 5. Layout

- Breakpoints: phone < 768, tablet 768–1023, desktop ≥ 1024, wide ≥ 1440. Verify at 412, 768, 1280, 1440 and 1920.
- S0 Landing is a full responsive marketing page (section 8).
- S3 Episode, phone: 16:9 clip on top, LIVE pill and countdown over it, 2×3 word board, position strip, ticket as bottom sheet.
- S3 Episode, desktop: a fluid full-width studio layout. Clip and position strip on the left (about 60 %), the word board as a 2×3 grid of large cards on the right, the ticket as a docked panel; nothing scrolls during play at 1280×800, and clip and board scale up to fill 1920. The clip spans its full column; position and ticket sit beneath it at equal height with outer edges flush to the clip, and the left stack ends on the board's bottom edge.
- Other app screens follow the same rule: one real desktop composition (two columns or a centred wide card with voxel art), never a 430 px phone column floating in empty space.
- Symmetry: sibling cards in a row share one height (reserve empty rows, such as "You sat this word out", rather than letting a card shrink), grids share column edges with the cards above them, step strips use equal cells, and a side panel starts on the first row of the grid it serves.

## 6. Motion

Motion explains the product, rewards an action or makes the brand alive. Library: `motion` for DOM, R3F `useFrame` plus `motion`'s `animate()` for 3D values. No GSAP.

| Event | Motion | Timing |
|---|---|---|
| Word SAID (signature) | Card flips on X like a split-flap, red SAID face lands with overshoot, voxel/emoji stickers ("OMG", "like") pop out of the card, screen gives a tiny shake on phones | spring 0.45 s, bounce 0.25; stickers 0.6 s |
| Press | scale 0.97 + shadow collapse | 140 ms `ease-out` |
| Hover (fine pointer) | lift 2 px; 3D voxels barrel-roll once | 140 ms; roll 1 s |
| Sheet / panel | slide | 280 ms `ease-drawer` |
| Price change | digits roll; card glows sun/green briefly | 180 ms |
| Cash out / redeem | coins arc from the card into the balance, balance counts up | 0.8 s |
| Settle | YES cards stamp in `gain`, NO cards fade, 40 ms stagger | 240 ms |
| Kickoff reveal | Until playback the clip frame sits under a blur of 6 % of the frame width with a 1.15 zoom, a "Clip hidden until kickoff" pill and the countdown sticker; as playback starts it sharpens and the zoom settles | 550 ms `ease-out`; reduced motion: 150 ms unblur, no zoom |
| Bets close | Open cards take a lock tag, their chance meter turns `no`, and each gives a small clunk in the board's 40 ms wave; an open ticket turns into the locked notice | 320 ms |
| Win (S5) | 3D voxel burst plus confetti stickers | ≤ 2.5 s |
| Landing reveals | `whileInView` once, y 32 px, 500 ms, 70 ms stagger; scroll-linked 3D entrances | |
| Landing ambience | voxels float and face the cursor; marquees scroll; mascot blinks | continuous, paused off-screen |

`prefers-reduced-motion: reduce`: no loops, no parallax, flips become a 150 ms crossfade, 3D shows static stickers. Haptic `navigator.vibrate(12)` on SAID where supported.

## 7. 3D

- Fourteen procedural voxel meshes (alien, game-console, globe, love, money-1, money-2, music-blue, music-red, pink-arrow, pixle, pixle-red, red-alien, star, zap) plus the SaySo mascot voxel built from the logo's pixel grid. `InstancedMesh` per colour, shared `RoundedBoxGeometry`, no model files.
- Landing: one fixed full-page `<Canvas>` with drei `View` (or one canvas per section at most three in total) so many scenes cost one WebGL context. Game screens S1–S4, S6–S8 never load three.js; S5 loads the win burst.
- Behaviour patterns: cursor-facing parallax (lerp 0.05), barrel roll on hover/tap (2π over 1 s, locked while spinning), scroll-driven entrances (slide in from the edge and rotate from −90°), gentle bob.
- `dpr` capped at 2; render only while visible (`frameloop="demand"` + invalidate, or IntersectionObserver); transparent background; lights: ambient 1.5, two key directionals at 2.0 from `[±6, 8, 5]`, fill 1.0 from below.
- Reduced motion or no WebGL: the matching WebP sticker renders instead.
- three.js stays out of the PWA precache.

## 8. Landing (S0, `/`)

Sections, in order (copy is short; every section has a desktop composition, not a stacked phone column):
1. Hero: mascot-led 3D scene filling the viewport, giant headline "Bet on the words before they're spoken.", a live word ticker flipping to SAID, red Play CTA, secondary "How it works", TESTNET pill.
2. Marquee: an endless strip of word stickers and voxel stickers.
3. How a round plays: four steps (pick words, watch the clip, the word flips SAID, cash out or hold) told as a scroll story on desktop (sticky phone mockup on one side, steps on the other) and stacked animated cards on phones.
4. Try it: a playable demo round with a fake caption feed, real flip, sound and coins. Labelled "Demo".
5. Fair by construction: two transcripts → Merkle roots onchain before trading → SAID within one Monad block → only Chainlink CRE settles; drawn as an animated pipeline.
6. Built on: Monad, Kuru, Chainlink CRE, Mera, Envio, each with one line on what it does here.
7. FAQ: five short answers (is it real money, how is it fair, what is a passkey, what happens if nobody says it, who settles).
8. Final CTA with a large 3D object and footer with TESTNET and "Sound effects: elevenlabs.io".

## 9. Illustration assets

Sources (29 voxel PNGs, about 400 px each, the logo and the mascot icon) live in `apps/web/assets-src/`. `bun run --cwd apps/web assets` writes WebP at 128 and 256 px into `apps/web/src/assets/voxels/`; screens import only the generated files. Voxel stickers are illustrations, empty-state art, reactions (`omg-message`, `wtf-message`, `like-message`) and draggable toys on the landing; UI controls use lucide icons at 2 px stroke. In the game, keep red voxels away from the board so red still means "said".

## 10. Sound

Family: bubbly mobile game show in C major pentatonic (C, D, E, G, A). A soft celesta bell, bright glockenspiel, round toy pluck and juicy bubble pop play short rising figures; a split-flap flick, coin cascade, twinkle and airy swoosh add texture. The loss cue is a cute descending toy-synth "aww", not a sad trombone. Bright, round and rewarding; dry, short, never casino, never harsh. No music competes with the clip's speech.

| Id | When | Shipped character | Shipped / max length | Loudness target |
|---|---|---|---|---|
| `tap` | Primary press | round E6 pluck with a quick decay | 0.140 / 0.15 s | −19 dB RMS |
| `pop` | Sticker grab/drop, mascot boop, playful micro-interactions | single rising C6 bubble bloop | 0.140 / 0.15 s | −19 dB RMS |
| `sheet` | Ticket opens | soft airy upward swoosh | 0.290 / 0.30 s | −21 dB RMS |
| `confirm` | Order sent | pluck C6 → E6, quiet C7 celesta on the second note | 0.390 / 0.40 s | −18 dB RMS |
| `fill` | Order filled | glockenspiel G6 → C7 "ba-ding" | 0.490 / 0.50 s | −18 LUFS |
| `said` | Word flips SAID (signature) | split-flap flick, then E6 → A6 → C7 glockenspiel "correct" chime at 55 / 110 / 165 ms | 0.811 / 0.90 s | −16 LUFS |
| `cashout` | Cash-out filled | sparkly coin cascade over a rising C6 → C7 celesta run | 0.890 / 0.90 s | −18 LUFS |
| `tick` | Last 5 s of a countdown | short soft flap tick | 0.110 / 0.12 s | −21 dB RMS |
| `start` | Playback starts | swoosh, C5 → C6 pluck run, C7 + E7 celesta chord and twinkle | 1.130 / 1.20 s | −16 LUFS |
| `win` | Episode settles in profit | joyful C5 → C6 pluck run, G6 + C7 + E7 celesta chord and sparkle | 1.140 / 1.80 s | −16 LUFS |
| `lose` | Episode settles at a loss | soft cute descending toy-synth "aww", dominant partial tuned to C6 | 0.954 / 1.00 s | −19 LUFS |
| `redeem` | Redeem filled | C6 bubble pop into a G6 + C7 glockenspiel ding | 0.590 / 0.60 s | −18 LUFS |

- Offline generation: ElevenLabs `POST /v1/sound-generation` (`eleven_text_to_sound_v2`) through `tools/sfx`. Exact prompts and layer timing/gains live in `tools/sfx/sounds.json`: one dry, isolated celesta/glockenspiel/pluck note, one juicy cartoon pop, one plastic split-flap flip, five or six light coin pings, one upward swoosh, a short glassy twinkle and a descending toy-synth "aww"; no voice, music bed or reverb tail. Four candidates per source are shared across cues to keep one timbre. Selected candidates: `bell#2`, `glock#3`, `pluck#2`, `bubble#2`, `flap#4`, `coins#2`, `swish#4`, `sparkle#4`, `aww#2`. The redesign used 304 API-reported credits over 48 requests, including replaced prompt candidates; final mastering reuses the cache. The key is read at runtime from the environment or repo `.env`, never shipped to the browser.
- Tuning/layering: ffmpeg snaps each tonal source's dominant partial to the nearest C major pentatonic note within six semitones of its configured home register; this is partial tuning, not a guarantee that every generated overtone is in key. Selected base notes are C7 for celesta/glockenspiel, C5 for pluck/bubble and C6 for "aww". Layer figures move in pentatonic steps. Optional exponential decay (`decay_ms`) finishes sustained notes like struck notes.
- Mastering: 80 Hz high-pass, per-cue low-pass where needed, leading silence below −50 dBFS trimmed, tails cut once they fall 45 dB below the loudest 10 ms, 5 ms fade-in, 30 ms fade-out and a 4× oversampled limiter. Mono 44.1 kHz MP3 at 128 kbps, true peak ≤ −1.5 dBTP. Targets above are measured on the encoded files: ≤ 0.4 s cues use RMS (±1.5 dB); longer cues use integrated LUFS (±1 LU). This louder family replaces the old −22 LUFS set; the tick and swoosh remain quieter than reward cues.
- Selection gates: encoded duration within the table's maximum, leading silence ≤ 10 ms, spectral centroid 1.2–5 kHz, energy above 10 kHz ≤ −18 dB relative to total energy, correct mono/sample-rate/bitrate and no true-peak clipping. Candidate scoring also penalises long tails, spiky transients, fizz, centroid drift and excessive repitching. All 12 shipped files total **126,747 bytes (123.8 KiB)** in `apps/web/public/sfx/`; `bun run --cwd tools/sfx measure` enforces the gates.
- Playback: Web Audio unlocked on first gesture; master gain **0.7**, ducked gain **0.35** under clip audio, 120 ms gain ramps, persistent mute. Only `tap` and `pop` vary playback rate uniformly from **0.97 inclusive to 1.03 exclusive** per play (about −53 to +51 cents, also varying duration); all other cues stay at rate 1. At most three voices, with a 15 ms fade on the oldest when stolen; duplicate requests for the same cue within 60 ms play once; starts more than 250 ms late are dropped.
- Licence: free ElevenLabs plan, non-commercial with attribution ("elevenlabs.io") in the footer, S8 and README ([terms](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform.md)) [V]. See BLOCKERS B11.

## 11. Copy

Short, plain, game-show confident, a little cheeky. Prices in cents, balances in AUSD with TESTNET beside them. No crypto jargon on S0–S4: "passkey", not "wallet"; "cash out", not "sell YES".

Bets window (S3/S4; new positions open only before kickoff, closing `TRADING_CLOSE_LEAD_MS` before the clip starts): the board chip and the countdown sticker read "Bets close in 0:42" (sun in the last 10 s), then "Bets locked — watch" with a lock; open cards wear a lock tag; a locked ticket explains why and keeps SAID cash-outs. After the clip the chip reads "Clip over · results next". Never show the clip title before kickoff.
