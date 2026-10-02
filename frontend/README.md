# Gist — frontend

React + Vite UI for the Gist study partner. See [`../Design.md`](../Design.md) for
the full design system.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api to the backend
```

The backend must be running on port 8000 (`uvicorn backend.main:app --reload`).
In dev and preview, Vite proxies `/api/*` to it, so nothing is hardcoded to a host.

```bash
npm run build      # tsc + production bundle
npm run preview    # serves the build with the same /api proxy
npm run typecheck  # types only
```

## Offline by default

Fonts (Newsreader, Inter, JetBrains Mono via Fontsource) and icons (Lucide) are
bundled, so the app renders with Wi-Fi off. Change the backend URL at build time
with `VITE_API_URL` if the API lives somewhere other than `/api`.

## Design notes

Everything follows `Design.md` except where noted below.

- **Tokens only.** No component writes a hex value; every colour is a `var(--token)`
  defined in `src/styles/tokens.css` for both themes.
- **Muted tile palette.** The brief for this build excludes punchy colours, so the
  topic tiles use six desaturated "index card" tones (clay, sage, sand, slate,
  rose, teal) instead of the lime, lavender and sky in `Design.md`. Assign by
  topic index so a topic always keeps its colour.
- **Signature.** `Design.md` describes square cards, hairline ink borders, serif
  headings and mono micro-labels. The one added device is a pair of letterpress
  register marks (`.regmark`) on hero surfaces — two diagonal crop ticks that echo
  the printed page. Corners stay tight, everything else stays quiet.
- **Shell geometry.** `Design.md` caps the app shell at 1100px with 1px borders on
  its outer edges. The borders are dropped and the cap raised to 1200px: canvas
  and shell share `--bg`, so rules drawn at the shell edge read as the page being
  cropped on both sides. Structure comes from the sidebar's own right rule. The
  720px / 860px content measures are unchanged.
- **No animation library.** Motion is CSS transitions on `transform`, `opacity`,
  `background-color` and `border-color` only, using custom easing curves. Press
  states scale to `0.97`, entrances never start from `scale(0)`, hover motion is
  gated behind `(hover: hover) and (pointer: fine)`, and `prefers-reduced-motion`
  removes movement while keeping colour feedback.
- **Answers stream.** `/ask` returns the whole answer, so the client reveals it
  steadily with a blinking caret; reduced motion shows it at once. Sources are
  chips under each answer that expand into the passage the answer came from.

## Structure

```
src/
├── styles/      tokens.css · base.css · components.css
├── lib/         api client, types, formatters, light markdown renderer
├── hooks/       theme, media query, streaming text, API data
├── components/  AppShell, Sidebar, TabBar, ChatMessage, QuizCard, TopicTile,
│                MasteryBar, ActivityGrid, SourceList, EmptyState, ThemeToggle
├── screens/     Ask, Quiz, Progress, Notes
└── App.tsx
```
