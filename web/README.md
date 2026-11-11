# SmartHabits web app

Installable web app (PWA) for SmartHabits: mark today's habits, correct past days, create and edit habits, browse progress, and manage API tokens. The server serves it from the same origin, so there is nothing to deploy separately. The UI is in Spanish.

React, Vite, Tailwind, shadcn/ui and TanStack Query.

## Run it

Start the [server](../backend/README.md) on port 8000, then:

```sh
cd web
npm ci
npm run dev       # http://localhost:5173, API requests proxied to :8000
```

Sign in with an account that has a password (`habits set-password`).

```sh
npm run lint      # oxlint
npm run build     # typecheck and build into dist/
```

## How it works

```
src/
  App.tsx          tab shell: Today, Habits, Progress, Settings
  screens/         one file per screen, plus habit detail and login
  components/      day strip, day sheet, habit form, rows, tokens sheet; ui/ is shadcn
  lib/api.ts       fetch wrapper (same-origin cookie)
  lib/data.tsx     queries and mutations (TanStack Query)
  lib/rules.ts     client-side schedule rules, mirroring the server's
  lib/router.ts    hash router
public/            icons and web manifest
```

- **Auth:** `POST /auth/login` sets a host-only session cookie, sent with every request (`credentials: "same-origin"`). There is no token in the browser.
- **Routing:** hash-based (`#/habits/12`), so the server only needs to serve `index.html`.
- **Dev proxy:** `vite.config.ts` forwards the API paths to `http://127.0.0.1:8000`. A new top-level API path the app calls must be added there.
- **Production:** the Docker image builds `dist/` and the server serves it at `/` through `HABITS_WEB_DIR`; API routes take precedence.

On Android, open the site in Chrome and use "Install app"; on iOS, Share → Add to Home Screen.
