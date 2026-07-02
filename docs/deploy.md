# Angle Protocol Multiplayer Deploy

## Backend

1. Verify syntax and tests with `npm run check`.
2. Deploy the Worker with `npm run deploy:api`.
3. Confirm `GET /health` and `GET /version` against the deployed URL.

## Frontend

1. Push the repo root to `main`.
2. GitHub Pages publishes the static client unchanged from the repo root.

## Rollback

- Frontend: revert the bad commit on `main`.
- Backend: run `wrangler rollback --config server/wrangler.jsonc` and re-check `/health`.

## Limitation

- Durable Object live match state is memory-only. Deploying the backend resets in-flight online matches.
