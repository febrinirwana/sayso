# SAYSO design system

How SAYSO looks, moves and sounds. Product rules and screen contents live in [PRD](PRD.md) sections 6 and 8; the stack lives in [ARCHITECTURE](technical/ARCHITECTURE.md) section 9. Values here are the source for `apps/web/src/styles/tokens.css`; change both in one commit.

## 1. Direction

A sticker-book game show. The brand mark is a red speech bubble with a black outline on warm paper, and every surface follows it: paper background, white sticker cards with ink outlines, chunky voxel objects as illustrations, one red that means "said". It should feel like a toy you want to press, never like a trading terminal or a generic dashboard.

## 2. Colour

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FDFBF4` | Page background (sampled from the logo) |
| `card` | `#FFFFFF` | Sticker cards, sheets, inputs |
| `ink` | `#0A0A0A` | Text, outlines, hard shadows (logo outline is `#000`) |
| `ink-soft` | `#55524A` | Secondary text, captions |
| `line` | `#E8E3D6` | Hairline dividers inside cards |
| `said` | `#FD2224` | The logo, SAID cards and the LIVE pill. Nothing else |
| `gain` | `#0B7A3B` | Profit, YES settled. 5.2:1 on paper |
| `no` | `#8F8A7E` | NO settled, losses, disabled |
| `voxel-blue` | `#4F52E8` | Voxel illustrations only, never UI |

Rules:
- Text on `said` is `ink` (5.4:1), never white (3.9:1 fails AA at body size).
- One red, one green. Losses are neutral, not red: red would read as "said".
- No gradients, glass, glow or blurred shadows.

## 3. Type

| Role | Face | Setting |
|---|---|---|
| Display, board words | Bricolage Grotesque Variable | weight 800, width 75 (condensed) for words on cards; width 100 for headlines; tracking −0.02 em |
| Body, UI | Inter Variable | 400/500/600; 16 px body, line-height 1.5 |
| Numbers | Inter Variable `tnum` | Prices as cents ("62¢"), balances with 2 decimals, always tabular |

Two families per page at most. Both are OFL and self-hosted through `@fontsource-variable`.

## 4. Shape and depth

- Sticker card: `card` fill, 2 px `ink` border, 20 px radius, hard shadow `0 3px 0 ink` (no blur). Pressed: translate 2 px down, shadow `0 1px 0 ink`.
- Pills (buttons, tags): 999 px radius, same border and shadow. Primary button is `ink` fill with `paper` text; there is no red button.
- Bottom sheet: 28 px top radius, 2 px top border, ink scrim at 40 %.
- Spacing scale 4 px; screen gutter 16 px at 412 px.

## 5. Layout

- App screens S1–S8 are portrait, designed at 390–430 px. On wider viewports the app renders as a centred 430 px column on `paper`, with static voxel stickers in the side margins at ≥ 1024 px.
- S3 Episode: 16:9 video full-bleed at the top, LIVE pill and countdown over its top edge, then the 2×3 word board, then the player's position strip.
- S0 Landing is the only responsive marketing page (section 8).

## 6. Motion

Motion reports a state change or explains the product; nothing loops for decoration inside the app.

| Event | Motion | Timing |
|---|---|---|
| Word SAID (signature) | Card flips on X like a split-flap: old face folds down, red SAID face lands with a small overshoot | spring, duration 0.45 s, bounce 0.25 |
| Press | scale 0.97 + shadow collapse | 120 ms `cubic-bezier(0.23,1,0.32,1)` |
| Sheet open/close | slide from bottom | 280 ms `cubic-bezier(0.32,0.72,0,1)` |
| Price change | digits roll, 1¢ steps | 180 ms ease-out |
| Settle | YES cards stamp in `gain`, NO cards fade to `no` | 240 ms, 40 ms stagger |
| Win (S5) | one 3D voxel burst (section 7), then stops | ≤ 2.5 s |

`prefers-reduced-motion: reduce` replaces flips and the 3D burst with a 150 ms crossfade. Haptic: `navigator.vibrate(12)` on SAID where supported; iOS has no vibration API and relies on sound.

## 7. 3D

- Fourteen voxel meshes (alien, game-console, globe, love, money-1, money-2, music-blue, music-red, pink-arrow, pixle, pixle-red, red-alien, star, zap) are procedural `InstancedMesh` grids with a shared `RoundedBoxGeometry`, recoloured to section 2. No model files.
- One `<Canvas>` per page at most: the S0 hero scene and the S5 win burst. Both are lazy chunks; S1–S4 and S6–S8 never load three.js.
- `dpr` capped at 2, `frameloop="demand"` while the canvas is off-screen, transparent background, lights: ambient 1.5 + two key directionals at 2.0 + one fill at 1.0.
- Reduced motion or no WebGL: the matching WebP sticker renders instead.

## 8. Landing (S0, `/`)

1. Hero: logo, headline "Bet on the words before they're spoken.", one line of explanation, Play CTA (to S1/S2), TESTNET pill, 3D voxel scene with gentle pointer parallax.
2. How it plays: three steps (pick a word, watch the clip, cash out or hold) with voxel stickers.
3. Try it: a tappable demo board of six sample words that flips with sound. Labelled "Demo".
4. Fair by construction: transcripts committed before trading, SAID within a block, settled only by Chainlink CRE.
5. Built on: Monad, Kuru, Chainlink CRE, Mera, Envio.
6. Final CTA and footer with TESTNET and "Sound effects: elevenlabs.io".

Scroll reveals use `motion` `whileInView` once (y 24 px, 400 ms ease-out, 60 ms stagger).

## 9. Illustration assets

Sources (29 voxel PNGs, about 400 px each, and the logo) live in `apps/web/assets-src/`. `bun run --cwd apps/web assets` writes WebP at 128 and 256 px into `apps/web/src/assets/voxels/`; screens import only the generated files. Voxels are illustrations and empty-state art; UI controls use lucide icons at 2 px stroke.

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

Short, plain, game-show confident. Prices in cents, balances in AUSD with TESTNET beside them. No crypto jargon on S0–S4: "passkey", not "wallet"; "cash out", not "sell YES".
