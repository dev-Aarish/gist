# Design.md: Gist UI

A design system for the Exam Buddy frontend (React + Vite). Use this as the single source of truth when building components.

---

## 1. Design Direction

Two references shaped this system:

- **Editorial cream page (light reference):** warm off-white canvas, a refined serif for headings, tiny uppercase labels with wide letter spacing, thin dark borders on square-ish cards, and playful pastel color blocks as the only "loud" element.
- **Dark data app (dark reference):** near-black canvas, hairline borders instead of shadows, monospace type for data and chat, soft sage-gray chat bubbles, small green/red accents, and hatched or grid-pattern data visuals.

**The blend:** a calm, bookish study tool. Serif headings give it warmth and a "notebook" feel. Mono and uppercase micro-labels give it a precise, technical feel. Color is used sparingly: pastel tiles for topics, green and red only for correct and wrong.

### Principles

1. **Calm over punchy.** No pure white, no pure black, no saturated fills outside topic tiles and status colors.
2. **Borders, not shadows.** Structure comes from 1px lines. No drop shadows (except a focus ring).
3. **Content first.** The user's notes, answers, and quiz questions are the hero. Chrome stays quiet.
4. **Readable for long sessions.** Generous line height, soft contrast, no flashing animation.
5. **Works offline.** No CDN fonts, icons, or scripts. Everything is bundled locally.

---

## 2. Theming (Light and Dark)

Both modes use the same token names. Components never hardcode colors, they only use tokens.

### Behavior

- Default follows the OS setting (`prefers-color-scheme`).
- A toggle in the sidebar/header lets the user override it (Light / Dark / System).
- Save the choice in `localStorage` under `theme` and apply it as `data-theme="light|dark"` on `<html>`.
- Apply the saved theme in an inline script in `index.html` **before React loads**, to avoid a flash of the wrong theme.
- Animate theme changes with a short `background-color` and `color` transition (150 ms), and disable it on first paint.

```html
<!-- index.html, inside <head> -->
<script>
  (function () {
    try {
      var saved = localStorage.getItem('theme');
      var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var theme = saved === 'light' || saved === 'dark' ? saved : (dark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {}
  })();
</script>
```

---

## 3. Color Tokens

### Core palette

| Token | Light (cream) | Dark | Use |
|---|---|---|---|
| `--bg` | `#F4F1EA` | `#0F1011` | App background |
| `--surface` | `#FAF8F3` | `#161718` | Cards, panels, inputs |
| `--surface-2` | `#ECE8DF` | `#1D1E20` | Hover, subtle fills, code blocks |
| `--border` | `#1C2B33` | `#2C2E31` | Default 1px border |
| `--border-soft` | `#D9D4C8` | `#232426` | Dividers inside cards |
| `--text` | `#1C2B33` | `#E8E6E1` | Primary text |
| `--text-muted` | `#5E6B73` | `#8D9093` | Secondary text, labels |
| `--text-faint` | `#8A9399` | `#5C5F62` | Placeholders, disabled |
| `--accent` | `#1F4E5F` | `#B9D3CC` | Links, focus ring, primary actions |
| `--on-accent` | `#F4F1EA` | `#0F1011` | Text on accent fills |

Notes:
- Light mode uses a **deep teal-ink** (`#1C2B33`) instead of black, which matches the editorial reference and keeps contrast high but soft.
- Dark mode uses a **warm off-white** (`#E8E6E1`), not pure white, so long reading sessions stay comfortable.
- Light `--border` is intentionally strong (ink). It is the signature of the editorial look. If it feels heavy in dense areas, use `--border-soft`.

### Assistant chat bubble (from the dark reference)

| Token | Light | Dark |
|---|---|---|
| `--bubble-assistant-bg` | `#FAF8F3` (with 1px `--border`) | `#D5DCD9` |
| `--bubble-assistant-text` | `#1C2B33` | `#16191A` |
| `--bubble-user-bg` | `#ECE8DF` | `#222426` |
| `--bubble-user-text` | `#1C2B33` | `#E8E6E1` |

### Status colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `--success` | `#276B4B` | `#4CC38A` | Correct answer, mastery high |
| `--success-bg` | `#DDE9DD` | `#16261E` | Correct answer background |
| `--warning` | `#8A5A12` | `#E0B04E` | Mid mastery |
| `--warning-bg` | `#F0E3C6` | `#2A2314` | Mid mastery background |
| `--danger` | `#9B2F2F` | `#E5675F` | Wrong answer, weak topic |
| `--danger-bg` | `#F1D9D4` | `#2A1716` | Wrong answer background |

### Topic tile colors (from the editorial reference)

Pastel blocks used on topic and subject tiles. Assign them per topic, and never use them for status.

| Token | Light | Dark (muted) |
|---|---|---|
| `--tile-sky` | `#A9DCE8` | `#2A4A52` |
| `--tile-lime` | `#CFDB93` | `#3D4727` |
| `--tile-rose` | `#E8B7B7` | `#523333` |
| `--tile-mint` | `#AEDDBE` | `#294738` |
| `--tile-lavender` | `#CFC4E3` | `#403A56` |
| `--tile-butter` | `#F2D58A` | `#524521` |

Cycle through these in order by topic index so the same topic always gets the same color.

### Contrast checks

Aim for WCAG AA: 4.5:1 for body text, 3:1 for large text and UI borders. Verify every text/background pair above with a contrast checker before finalizing, especially `--text-muted` and the status colors on their `-bg` fills.

---

## 4. Typography

All fonts are bundled locally with **Fontsource** so the app works with no internet.

```bash
npm i @fontsource-variable/newsreader @fontsource-variable/inter @fontsource-variable/jetbrains-mono
```

| Role | Font | Fallback stack | Used for |
|---|---|---|---|
| Display / headings | **Newsreader** (serif) | `Georgia, 'Times New Roman', serif` | Page titles, quiz questions, empty states |
| UI / body | **Inter** | `system-ui, -apple-system, 'Segoe UI', sans-serif` | Buttons, nav, answers, body copy |
| Data / labels | **JetBrains Mono** | `ui-monospace, 'SF Mono', Menlo, monospace` | Numbers, percentages, citations, micro-labels, code |

```css
:root {
  --font-display: 'Newsreader Variable', Georgia, 'Times New Roman', serif;
  --font-ui: 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace;
}
```

### Type scale

| Style | Font | Size / Line height | Weight | Notes |
|---|---|---|---|---|
| Display | Display | 36 / 44 | 400 | Welcome screens only |
| H1 | Display | 28 / 36 | 400 | Page title |
| H2 | Display | 22 / 30 | 400 | Section title, quiz question |
| H3 | Display | 18 / 26 | 500 | Card title |
| Body | UI | 15 / 24 | 400 | Answers, descriptions |
| Body small | UI | 13 / 20 | 400 | Secondary text |
| Micro-label | Mono | 11 / 16 | 500 | UPPERCASE, `letter-spacing: 0.12em` |
| Data | Mono | 13 / 20 | 400 | Percentages, counts, citations |
| Data large | Mono | 28 / 32 | 400 | Stat numbers |

Rules:
- Headings use regular weight in serif. Avoid bold serif.
- Micro-labels (like "YOUR NOTES", "WEAK SPOTS", "QUESTION 3 OF 5") are always uppercase mono with wide tracking, matching the editorial reference.
- Use italic serif for one emphasized word in a welcome headline (like "Welcome back, *Rahul*"), as in the reference.
- Keep answer text at 65-75 characters per line.

---

## 5. Spacing, Radius, Borders

- **Spacing scale (px):** 4, 8, 12, 16, 24, 32, 48, 64. Use tokens: `--space-1` to `--space-8`.
- **Radius:** `--radius-sm: 2px` (tiles, inputs), `--radius-md: 6px` (cards, bubbles), `--radius-pill: 999px` (chips only). Keep corners tight, because square-ish cards are the editorial signature.
- **Borders:** `1px solid var(--border)` for primary containers, `1px solid var(--border-soft)` for inner dividers.
- **Shadows:** none, except the focus ring below.
- **Focus ring:** `outline: 2px solid var(--accent); outline-offset: 2px;` on every interactive element.
- **Max content width:** 720px for chat and quiz text; 1100px for the app shell.

---

## 6. Layout

### Desktop (≥ 900px)

```
┌───────────────┬────────────────────────────────────┐
│ Sidebar 240px │ Main (max 720px content, centered) │
│  Logo         │                                    │
│  Nav          │   Active screen                    │
│  Your notes   │                                    │
│  Theme toggle │                                    │
└───────────────┴────────────────────────────────────┘
```

### Mobile (< 900px)

- Sidebar collapses. Use a **bottom tab bar** (Ask, Quiz, Progress, Notes), borrowed from the dark reference.
- Content is full-width with 16px side padding.
- Tap targets are at least 44 × 44px.

---

## 7. Components

### Buttons

| Variant | Style |
|---|---|
| Primary | `--accent` fill, `--on-accent` text, no border |
| Secondary | `--surface` fill, 1px `--border`, `--text` |
| Ghost | Transparent, `--text-muted`, hover `--surface-2` |
| Danger | 1px `--danger` border, `--danger` text |

Height 36px (40px on mobile), padding 0 16px, radius `--radius-sm`, UI font 14px weight 500. Only one primary button per view.

### Inputs

Surface fill, 1px `--border`, radius `--radius-sm`, 40px height, UI font. Placeholder uses `--text-faint`. Chat input has an attach icon on the left and a send button on the right (as in the dark reference).

### Cards

`--surface` background, 1px `--border`, radius `--radius-md`, padding 16-20px. No shadow. A small mono micro-label sits at the top as the card's title.

### Topic tile (from the editorial reference)

A bordered card with a **pastel color block on top** (height ~96px, `--tile-*`), and a text area below with a serif title and a mono micro-label (for example "12 QUESTIONS · WEAK"). Optionally add a simple flat shape in the color block (circle, bar, or line pattern). Do not use photos.

### Chat

- **User bubble:** right-aligned, `--bubble-user-*`, radius `--radius-md`, max width 80%.
- **Assistant bubble:** left-aligned, `--bubble-assistant-*`, max width 92%. In light mode, give it a 1px `--border`.
- **Timestamp:** mono 11px, `--text-muted`, bottom-right inside the bubble.
- **Streaming:** show tokens as they arrive with a thin blinking caret. Do not animate each word.
- **Source chips:** under each answer, small mono chips like `Unit 1 notes · p.12`. Style: `--surface-2` fill, 1px `--border-soft`, radius `--radius-sm`, clickable to open that page.

### Quiz card

- Micro-label: `QUESTION 3 OF 5`.
- Question in H2 serif.
- Options are full-width rows with 1px `--border`, 12px padding, radius `--radius-sm`. Hover: `--surface-2`.
- After answering: correct option turns `--success-bg` with a `--success` border and check icon. A wrong choice turns `--danger-bg` with a `--danger` border and x icon. The correct answer is always revealed.
- Never use color alone: always pair it with an icon and text.
- Explanation appears below in body small, with a source chip.
- A thin progress bar at the top of the card (2px, `--accent`).

### Weak spots (progress bars)

- Each topic is a row: name (UI 14px), percentage (mono), and a 8px bar.
- Bar color follows status tokens: below 50% `--danger`, 50-75% `--warning`, above 75% `--success`.
- Bar track uses `--surface-2`.
- Optional hatched fill (diagonal stripes via `repeating-linear-gradient`) for "not yet attempted" topics, echoing the hatched bars in the dark reference.
- Sort weakest to strongest. A single secondary button, "Quiz me on weak spots", sits below.

### Study heatmap (stretch goal)

A small grid of square cells (like the transactions heatmap in the dark reference) showing study activity per day. Five intensity steps from `--surface-2` to `--accent`. Always include a text summary for screen readers.

### Source and offline badges

- **Offline badge:** a small mono pill in the sidebar footer: `● RUNS LOCALLY`. Use a `--success` dot. This supports the open-source story.
- **Model badge:** shows the active model name in mono, for example `qwen2.5:7b`, in the sidebar footer or settings.

### Empty and loading states

- **Empty state:** serif H2 headline ("Add your first notes"), one line of body copy, one primary button ("Add notes"). No illustrations needed.
- **Loading:** use a skeleton block for answers, and a thin indeterminate progress line for file indexing. Show the file name and a page counter in mono (`Indexing p. 14 / 62`).

---

## 8. Icons

Use **Lucide** (`lucide-react`), stroke width 1.5, size 16-20px. It bundles locally, so it works offline. Icons inherit `currentColor`. Icon-only buttons need an `aria-label`.

Suggested set: `MessageSquare` (Ask), `CircleHelp` (Quiz), `ChartColumn` (Progress), `FileText` (Notes), `Upload`, `ArrowUp` (send), `Paperclip`, `Check`, `X`, `Sun`, `Moon`, `Monitor` (System theme).

---

## 9. Motion

- Durations: 120 ms (hover), 200 ms (panel and card transitions), 150 ms (theme change).
- Easing: `cubic-bezier(0.2, 0, 0, 1)`.
- Animate only `opacity`, `transform`, `background-color`, and `border-color`.
- Respect `prefers-reduced-motion`: disable transforms and the caret blink.
- No confetti, bouncing, or celebratory effects. A calm tone matters more than delight.

---

## 10. Content and Tone

- Sentence case everywhere ("Quiz me", not "Quiz Me"). Micro-labels are the exception, because they are uppercase by style.
- Friendly and brief. Buttons start with a verb ("Add notes", "Start quiz").
- Errors say what happened and what to do next ("Couldn't read that PDF. Try a text-based file.").
- When the model can't find an answer in the notes, say so plainly: "I couldn't find this in your notes." Never guess.
- Don't use exclamation marks in system copy.

---

## 11. Accessibility Checklist

- [ ] Text contrast meets WCAG AA in both themes
- [ ] Visible focus ring on all interactive elements
- [ ] Full keyboard navigation (tab order, Enter to send, number keys to pick quiz options)
- [ ] Correct/wrong feedback uses icon + text, not just color
- [ ] `aria-live="polite"` on the streaming answer region
- [ ] Heatmap and charts have text alternatives
- [ ] `prefers-reduced-motion` respected
- [ ] Touch targets at least 44px on mobile
- [ ] Theme toggle has an accessible name and shows current state

---

## 12. Implementation Notes (React + Vite)

### Suggested structure

```
frontend/
├── index.html                 # inline theme script
├── src/
│   ├── styles/
│   │   ├── tokens.css         # all CSS variables, both themes
│   │   ├── base.css           # resets, typography, focus ring
│   │   └── components.css     # or CSS Modules per component
│   ├── components/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   ├── ThemeToggle.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── SourceChip.tsx
│   │   ├── QuizCard.tsx
│   │   ├── TopicTile.tsx
│   │   ├── MasteryBar.tsx
│   │   └── Heatmap.tsx
│   ├── screens/               # Ask, Quiz, Progress, Notes
│   ├── hooks/                 # useTheme, useStreamingAnswer
│   └── main.tsx
```

### tokens.css skeleton

```css
:root,
:root[data-theme='light'] {
  --bg: #F4F1EA;
  --surface: #FAF8F3;
  --surface-2: #ECE8DF;
  --border: #1C2B33;
  --border-soft: #D9D4C8;
  --text: #1C2B33;
  --text-muted: #5E6B73;
  --text-faint: #8A9399;
  --accent: #1F4E5F;
  --on-accent: #F4F1EA;
  --success: #276B4B;  --success-bg: #DDE9DD;
  --warning: #8A5A12;  --warning-bg: #F0E3C6;
  --danger:  #9B2F2F;  --danger-bg:  #F1D9D4;
  --bubble-assistant-bg: #FAF8F3;
  --bubble-assistant-text: #1C2B33;
  --bubble-user-bg: #ECE8DF;
  --bubble-user-text: #1C2B33;
  --tile-sky: #A9DCE8; --tile-lime: #CFDB93; --tile-rose: #E8B7B7;
  --tile-mint: #AEDDBE; --tile-lavender: #CFC4E3; --tile-butter: #F2D58A;
}

:root[data-theme='dark'] {
  --bg: #0F1011;
  --surface: #161718;
  --surface-2: #1D1E20;
  --border: #2C2E31;
  --border-soft: #232426;
  --text: #E8E6E1;
  --text-muted: #8D9093;
  --text-faint: #5C5F62;
  --accent: #B9D3CC;
  --on-accent: #0F1011;
  --success: #4CC38A;  --success-bg: #16261E;
  --warning: #E0B04E;  --warning-bg: #2A2314;
  --danger:  #E5675F;  --danger-bg:  #2A1716;
  --bubble-assistant-bg: #D5DCD9;
  --bubble-assistant-text: #16191A;
  --bubble-user-bg: #222426;
  --bubble-user-text: #E8E6E1;
  --tile-sky: #2A4A52; --tile-lime: #3D4727; --tile-rose: #523333;
  --tile-mint: #294738; --tile-lavender: #403A56; --tile-butter: #524521;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  transition: background-color 150ms, color 150ms;
}
```

### Practical rules for the build

1. Never write a hex value inside a component. Always use `var(--token)`.
2. Build in this order: tokens → AppShell + ThemeToggle → Ask screen → Quiz → Progress.
3. Test every screen in both themes before moving on.
4. Test at 375px (phone) and 1280px (laptop) widths.
5. Keep all assets local, with no external fonts, icons, or scripts, so the offline demo works.

---

## 13. Do and Don't

| Do | Don't |
|---|---|
| Use creamy off-white and warm near-black | Use `#FFFFFF` or `#000000` anywhere |
| Separate areas with 1px borders | Add drop shadows or glows |
| Use pastel colors only for topic tiles | Use pastel colors for status or buttons |
| Pair status colors with icons and text | Rely on red/green alone |
| Use serif for headings, mono for data | Mix more than these three fonts |
| Keep screens sparse and calm | Add gradients, confetti, or decorative animation |
| Stream answers and show sources | Show an answer without its source |

---

## 14. Hand-off Checklist

- [ ] Both themes implemented through tokens only
- [ ] Theme toggle with System / Light / Dark, saved to `localStorage`
- [ ] Fonts and icons bundled locally (verified with Wi-Fi off)
- [ ] Ask, Quiz, and Progress screens match this spec
- [ ] Offline badge and model badge visible
- [ ] Accessibility checklist passed
- [ ] Screenshots of both themes captured for the dev.to post
