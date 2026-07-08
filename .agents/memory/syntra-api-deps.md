---
name: SYNTRA api-server dependencies
description: Package dependencies specific to the api-server that must be installed explicitly
---

The api-server uses esbuild (build.mjs) to bundle TypeScript. All imports must be resolvable at build time or the build fails.

**Key packages that must be installed in @workspace/api-server:**
- `date-fns` — used in time-logs.ts for CSV date formatting (NOT available by default)
- `nodemailer` — for SMTP email utility (installed in previous session)
- `bcryptjs` — already installed
- `zod` — already installed

**Why:** The monorepo root doesn't share all deps into the api-server sub-package. If a file uses `import { format } from "date-fns"` and date-fns isn't in api-server/package.json, esbuild will fail with "Could not resolve".

**How to apply:** When adding a new import to any api-server route, check if the package is in artifacts/api-server/package.json. If not, run `pnpm --filter @workspace/api-server add <package>`.
