# Angle Protocol

Angle Protocol is a fast, low-poly first-person arena shooter built as a static
frontend plus a Cloudflare Workers multiplayer backend. The live build keeps
offline Bot Strike and Training Range intact, then layers in guest online queue
play, private rooms, server-authoritative movement/combat, and local-only
progression.

## Play Online

- Frontend: `https://itsnotmarvin.github.io/chickennugget/`
- Backend: `https://angle-protocol.itsnotmarvin.workers.dev`
- Queue modes: Random 1v1 and Random 2v2
- Private rooms: create an invite code in the lobby, or open `?room=CODE&region=uswest`

## Local Dev

```bash
npm install
npm run dev
```

- `npm run dev:web` serves the frontend from the repo root.
- `npm run dev:api` runs the Worker locally on `http://localhost:8787`.
- Use two browser tabs for local multiplayer smoke tests: one tab can queue or
  create a room, the second can join from the same local backend.

## Architecture

- Multiplayer design and constraints: [`docs/multiplayer-architecture.md`](docs/multiplayer-architecture.md)
- Deploy, update, and rollback runbook: [`docs/deploy.md`](docs/deploy.md)
- Worker entrypoints live in `server/src/`
- Shared protocol/combat rules live in `shared/`
- Browser client modules live in `js/`

## Controls

| Action | Key |
| --- | --- |
| Move | `W A S D` |
| Aim | Mouse |
| Shoot / Knife slash | `LMB` |
| Knife stab | `RMB` |
| Sprint | `Shift` |
| Jump | `Space` |
| Reload | `R` |
| Primary | `1` |
| Sidearm | `2` |
| Knife | `3` |
| Splinter grenade | `4` |
| Dazzler flash | `5` |
| Agent ability | `Q` |
| Knife inspect | `F` |
| Pause | `Esc` |

## Deployment

- Frontend deploy: push `main` to GitHub Pages.
- Backend deploy: `npm run deploy:api`
- Backend deploys require Wrangler auth on the machine running the command.

## Update Workflow

1. Make changes locally.
2. Run `npm run check`.
3. Push frontend changes to `main`.
4. Deploy backend changes with `npm run deploy:api` when Worker code changes.
5. Follow the rollback notes in [`docs/deploy.md`](docs/deploy.md) if a deploy
   must be reverted.

## Limitations

- Region selection is a best-effort location hint, not a hard regional pin.
- There is no lag compensation in v1.
- In-flight online matches reset when the backend is redeployed.
- 2v2 queueing and match simulation work, but deeper team polish is deferred to v1.1.
- `2v2 vs Bots` is the local bot match, not a server-hosted mode.
- Google sign-in is stubbed and hidden behind a disabled config flag.
