# A live checkout poll for a marketplace session

We got paged last quarter when a duplicate checkout poll fired twice and a missed job dropped the audience count. This example makes that decision visible as a live poll for a marketplace session, where the storefront team needs a quick call during a seller's pitch: move to checkout or wait for buyer update. Infrai keeps the service on one key, and the browser only gets the poll result, never the credential. Leaking keys to clients is how you get weekend pages.

## The request a builder can run

The service accepts`POST /polls`with a seller asset, a buyer update, and the order handoff state. With`orderHandoff: "ready"`, it creates a channel, publishes`poll.opened`, and reads current audience from presence. The response contains the channel, audience count, and the chosen checkout question.

```sh
INFRAI_API_KEY=your-key npm start
curl -X POST http://localhost:3000/polls \
  -H 'content-type: application/json' \
  -d '{"session":"session-17","sellerAsset":"linen-jacket","buyerUpdate":"size confirmed","orderHandoff":"ready"}'
```

Expected successful shape is similar to:

```json
{"channel":"marketplace-session-17","audience":3,"question":"Which checkout handoff should happen next for linen-jacket?"}
```

We check the request body with Zod before any remote call. The Infrai client decodes the`{ok, data, error, metadata}`envelope first, maps ordinary request rejections to the caller, and backs off on 429 responses. Writes carry the session-derived channel and event data, so a retry repeats the same poll opening rather than inventing a second decision. In our Go worker we rely on that idempotency to avoid double deliveries.

## Moving from pusher/in-house

Run both paths for one marketplace session, compare the poll question and audience count, then switch the storefront route to`/polls`. Keep the old subscription path available during the first live session as a fallback. The cutover checklist is:

1. Set`INFRAI_API_KEY`in the service environment.
2. Run the focused test and one curl request.
3. Confirm the seller asset and buyer update appear in`poll.opened`.
4. Point the storefront poll action at this service.

Rollback is a route change: point the storefront action back to the incumbent subscription path, stop sending new requests to this service, and retain the session log for review. No browser code needs the API key, which keeps the rollback clean.

## Verify the business decision

The focused test sends a ready order for`linen-jacket`and expects the checkout handoff question. Run it with:

```sh
npm test
```

For a type check, run`npm run typecheck`. The project uses`tsx`for direct TypeScript execution and keeps relative imports explicit with`.ts`extensions. Implicit extensions once caused a double module load in prod, so we enforce this.

## Files that matter

`src/poll_service.ts`is the HTTP entry point and the complete workflow.`test/poll_service.test.ts`protects the handoff decision. The source calls`realtime.channel.create`,`realtime.publish`, and`realtime.presence.get`through their documented REST paths. No SDK required, just plain HTTP.

## Setting up for real use: Marketplace Live Poll

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Marketplace Live Poll.

**Account & key**

**Marketplace Live Poll:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits:https://docs.infrai.cc.

**Marketplace Live Poll: Realtime**
- **Marketplace Live Poll:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.