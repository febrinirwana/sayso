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
- Spacing scale 4 px. Gutters 16 px at 412, 32 px at 768, 48–64 px at 1280+. Content max width 1280 px (landing 1360 px).

## 5. Layout

- Breakpoints: phone < 768, tablet 768–1023, desktop ≥ 1024, wide ≥ 1440. Verify at 412, 768, 1280 and 1440.
- S0 Landing is a full responsive marketing page (section 8).
- S3 Episode, phone: 16:9 clip on top, LIVE pill and countdown over it, 2×3 word board, position strip, ticket as bottom sheet.
- S3 Episode, desktop: a studio layout. Clip and position strip on the left (about 60 %), the word board as a 2×3 grid of large cards on the right, the ticket as a docked panel; nothing scrolls during play at 1280×800.
- Other app screens follow the same rule: one real desktop composition (two columns or a centred wide card with voxel art), never a 430 px phone column floating in empty space.

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

| Id | When | Character | Max length |
|---|---|---|---|
| `tap` | Primary press | soft wooden click | 0.15 s |
| `sheet` | Ticket opens | paper swish | 0.3 s |
| `confirm` | Order sent | two-note up blip | 0.4 s |
| `fill` | Order filled | coin drop into tray | 0.5 s |
| `said` | Word flips SAID (signature) | split-flap clack + bright game-show ding | 0.8 s |
| `cashout` | Cash-out filled | short coin cascade | 0.8 s |
| `tick` | Last 5 s of a countdown | muted clock tick | 0.12 s |
| `start` | Playback starts | short brass sting | 1.5 s |
| `win` | Episode settles in profit | cheerful fanfare hit | 2 s |
| `lose` | Episode settles at a loss | gentle descending "aww" tone | 1.2 s |
| `redeem` | Redeem filled | cash register ding | 0.6 s |

- Generated once with ElevenLabs `POST /v1/sound-generation` (`eleven_text_to_sound_v2`) by `tools/sfx`; prompts live in `tools/sfx/sounds.json`. The key is read from `.env` and never reaches the browser.
- Mastered with ffmpeg: trim leading silence, 5 ms fade-in, 30 ms fade-out, mono 44.1 kHz, peak ≤ −3 dBTP, loudness −22 LUFS for UI sounds (`sheet` −24, `tick` −25 because they repeat) and −18 LUFS for `start`/`win`; clips under 0.4 s are gated on RMS. Shipped as MP3 128 kbps in `apps/web/public/sfx/`; `bun run --cwd tools/sfx measure` fails if any file misses its target.
- Playback: Web Audio, unlocked on first gesture; master volume 0.5; persistent mute; ducked to 0.3 while clip audio plays. No music: the clip's own speech is what players are judging.
- Licence: free ElevenLabs plan, non-commercial with attribution ("elevenlabs.io") in the footer, S8 and README ([terms](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform.md)) [V]. See BLOCKERS B11.

## 11. Copy

Short, plain, game-show confident, a little cheeky. Prices in cents, balances in AUSD with TESTNET beside them. No crypto jargon on S0–S4: "passkey", not "wallet"; "cash out", not "sell YES".
