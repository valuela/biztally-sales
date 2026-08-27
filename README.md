# App Starter

A lightweight, mobile-first foundation for an installable web application. It contains no authentication, database schema, business logic, or application-specific features.

## Tech stack

- React and TypeScript
- Vite
- Tailwind CSS
- Supabase JavaScript client (optional until configured)
- `vite-plugin-pwa`
- ESLint
- npm

## Requirements

- Node.js 22.13+ or 24 LTS
- npm 10+

## Install and run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Supabase credentials are not required to start or build the app.

## Production checks

```bash
npm run typecheck
npm run lint
npm run build
npm run preview
```

The production output is written to `dist/`.

## Environment variables

Copy `.env.example` to `.env.local` after creating a Supabase project:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Only use the public anon/publishable key in the browser. Never add a Supabase service-role key to a `VITE_` variable. `src/lib/supabase.ts` exports a nullable client and an `isSupabaseConfigured` flag, so missing credentials are handled without crashing.

## Deploy to Vercel

1. Import the repository in Vercel.
2. Keep the detected Vite framework settings (`npm run build`, output directory `dist`).
3. When Supabase exists, add both environment variables in the Vercel project settings.
4. Deploy. `vercel.json` rewrites future client-side routes to `index.html`.

## Install on iPhone

PWA service workers require a production build and HTTPS (localhost is also allowed during browser development). After deployment:

1. Open the deployed site in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Launch **Starter** from the Home Screen.

The manifest, standalone display mode, safe-area padding, mobile viewport, Apple metadata, and service worker are already configured.

## Project structure

```text
public/                 PWA icons
src/
├── components/
│   └── Button.tsx      Starter button
├── lib/
│   └── supabase.ts     Optional Supabase client
├── App.tsx             Blank starter screen
├── index.css           Tailwind and mobile foundations
└── main.tsx            React and service-worker entry
vite.config.ts          Vite, Tailwind, and PWA configuration
vercel.json             SPA fallback for Vercel
```

Add new `features`, `hooks`, `pages`, or `types` directories only when real application work requires them.
