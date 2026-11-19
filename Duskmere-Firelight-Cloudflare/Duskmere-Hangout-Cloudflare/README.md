# Duskmere — Firelight (Cloudflare edition)

This is the card-free hosting build of the Firelight hangout. It runs the static game assets on Cloudflare Workers and uses a Durable Object per room for WebSockets, room presence, chat, movement, WebRTC signaling, and chess synchronization. Voice audio remains browser-to-browser. Up to 8 friends per room.

## Deploy using the Cloudflare dashboard + GitHub

1. Create a free Cloudflare account. Cloudflare's Workers site advertises its free start as not requiring a credit card.
2. Create a new **empty GitHub repository** for this version, for example `Firelight-cloudflare`.
3. Upload the contents of this folder to the repository root. Make sure `wrangler.jsonc`, `package.json`, `src/worker.js`, and the `public` folder are at the root level. Do not upload the ZIP as the only file.
4. In Cloudflare, open **Workers & Pages → Create application → Connect to Git** (or the GitHub option). Connect GitHub, select the repository, and use `main` as the production branch.
5. Keep the project root blank. Use deploy command `npx wrangler deploy`; there is no framework build command needed. Cloudflare Workers Builds should use the Wrangler config in this repository, including the Durable Object binding and migration. Choose/save the Worker name `duskmere-firelight` to match `wrangler.jsonc`.
6. When deployment completes, open the HTTPS `workers.dev` address. One friend creates a room and shares the 6-character code; other friends enter that code at the same address.

The Git connection/deploy path is described in Cloudflare's Workers Builds docs: https://developers.cloudflare.com/workers/ci-cd/builds/ . The service uses Cloudflare Durable Objects with SQLite, which is available on the Workers Free plan.

## Deploy from a computer instead

Requires Node.js 20 or newer:

```bash
npm install
npx wrangler login
npm run deploy
```

`wrangler login` opens Cloudflare's sign-in/authorization page. It does not ask you to put an API token into the project. The command prints the deployed HTTPS address.

## Local preview

```bash
npm install
npm run dev
```

Open the local address Wrangler prints. For microphone access outside localhost, use the deployed HTTPS address.

## Free-tier / voice notes

- Cloudflare's published Workers Free plan includes 100,000 Worker requests per day; Durable Objects also have a free daily request allowance. WebSocket traffic uses that allowance, so movement is sent at a modest rate and idle players do not continuously send position updates. For bigger/longer rooms, check the live quota page before inviting a large group.
- Static asset requests are free under the published Workers pricing.
- Voice uses WebRTC with a public STUN server. Some strict networks block direct peer connections; in that case configure your own TURN service using `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` as Worker variables/secrets.
- Rooms are temporary. The host leaving closes the room; no accounts or saved profiles exist. Anyone who knows the room code can join. Keep codes among friends.

## Included code

- `src/worker.js` — Worker routes, room creation, and the Durable Object WebSocket room.
- `public/index.html`, `public/client.js` — game UI and browser client.
- `public/three.min.js`, `public/chess.min.js` — locally bundled browser libraries.
- `wrangler.jsonc` — Worker assets, Durable Object binding, and SQLite migration.
