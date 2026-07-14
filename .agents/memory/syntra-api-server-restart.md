---
name: SYNTRA api-server dev script builds once, doesn't watch
description: Why backend route/logic changes don't take effect until the workflow is restarted
---

`artifacts/api-server`'s `dev` script is `build && start` (esbuild bundle to `dist/index.mjs`, then run the bundle) — it is not a watch/hot-reload server.

**Why:** After editing any file under `artifacts/api-server/src/**` (new routes, changed handlers, etc.), the already-running process keeps serving the old bundle. Hitting the changed endpoint returns a plain 404 ("Cannot POST ...") even though the route clearly exists in source and typechecks cleanly — this looks like a routing bug but is actually a stale build.

**How to apply:** Always restart the `artifacts/api-server: API Server` workflow after any backend source change, before curling/testing the new behavior. The frontend (`web-app`, Vite) hot-reloads fine and does not need this.
