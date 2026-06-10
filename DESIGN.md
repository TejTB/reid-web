# Design

The visual system for Reid. This document is LAW: components and new surfaces conform to it; drift in code is a bug against this file, not the other way around.

## Theme

Dark, deep-navy, single-accent. Luxury, brutal, restrained. The orb is the only spectacle — no particles, no cinematics, no gradient text.

## Color Palette

### Backgrounds

| Token | Value | Use |
|---|---|---|
| `bg` | `#0A1628` | App background (default) |
| `voice-shell` | `#050810` | Full-screen voice mode behind the orb |
| `overlay` | `#060E1C` | Overlays (session recap, full-screen cards) |
| `surface` | `rgba(255,255,255,0.04)` | Card/surface fill on dark |

### Text

| Token | Value | Use |
|---|---|---|
| `text-primary` | `#F2EDE3` | Headlines, primary copy (warm ivory) |
| `text-secondary` | `#C8D5E3` | Secondary copy |
| `text-dim` | `#7A90A8` | Muted, metadata, placeholders |

### Accent & Orb

| Token | Value | Use |
|---|---|---|
| `accent` | `#B91C1C` | The single accent — actions, focus, selection |
| `orb-core` | `#8E1616` | ReidWebOrb core (mid `#B91C1C`, deep `#060E1C`) |

### Borders

All borders at or above `rgba(255,255,255,0.10)` — anything fainter disappears on the dark field.

## Typography

- **Playfair Display** — Reid's voice: headlines, anything Reid "says" on screen, recap titles.
- **Inter** — all UI: body, controls, navigation, metadata.
- Loaded via `next/font/google` in `src/app/layout.tsx` (`--font-serif`, `--font-sans`).

## Layout & Spacing

- 8px grid. All spacing, sizing, and gaps in multiples of 8 (4 permitted for micro-adjustments inside components).
- Generous negative space; density is an anti-pattern here.
- Mobile floor: 390px viewport. Bottom nav on mobile; sidebar in AppShell on desktop.

## Components

- **GlowCard** (`src/components/ui/glow-card.tsx`) is the ONLY card. Spec: `rgba(255,255,255,0.04)` background, `rgba(255,255,255,0.08)` border, 16px radius, `backdrop-blur(24px)`.
  - Known code drift (to fix, not to follow): border currently `0.06`, blur currently `5px`.
- **Never recreate**: glow-card, prompt-input-box, shining-text, border-trail, AppShell, LogoMark, LogoWordmark, ChatStream (inline), ReidOrb / ReidWebOrb, useVoiceLoop.
- **Do not invent**: `ReidLogo`, `ChatMessage` — they do not exist; the temptation to create them is a known failure mode.
- One orb (`ReidWebOrb`), one voice FSM (`useVoiceLoop`). No forks, no parallels.

## Motion

- **Framer Motion** only.
- Animate `transform` and `opacity` exclusively — never layout properties.
- No bounce, no elastic easing.
- Honor `prefers-reduced-motion`.
- Orb surfaces must hold 60fps.

## Anti-patterns (hard bans)

- Purple/violet gradients, gradient text, cyan-on-dark, glowing neon.
- Particles, cinematic intros, parallax spectacle.
- Pure black `#000` / pure white `#FFF` as field colors.
- Borders below `rgba(255,255,255,0.10)`.
- A second card primitive, a second orb, a second voice FSM.
