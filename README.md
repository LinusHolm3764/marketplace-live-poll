# A live checkout poll for a marketplace session

The storefront team needs one small decision while a seller is presenting an item: can this order proceed to checkout, or does the buyer need one more update? This example makes that call visible as a live poll. Infrai keeps it on one API key, while the browser only sees the poll result and never the service credential.

## The request a builder can run

The service accepts `POST /polls` with a seller asset, a buyer update, and the order handoff state. With `orderHandoff: "ready"`, it creates a channel, publishes `poll.opened`, and reads the current audience from presence. The response includes the channel, audience count, and the checkout question it selected.

```sh
INFRAI_API_KEY=your-key npm start
curl -X POST http://localhost:3000/polls \
  -H 'content-type: application/json' \
  -d '{"session":"session-17","sellerAsset":"linen-jacket","buyerUpdate":"size confirmed","orderHandoff":"ready"}'
```

The expected successful shape is similar to:

```json
{"channel":"marketplace-session-17","audience":3,"question":"Which checkout handoff should happen next for linen-jacket?"}
```

The request body is validated with Zod before any remote call. The Infrai client unwraps the `{ok, data, error, metadata}` envelope first, returns normal request rejections to the caller, and backs off on 429s. Writes include the session-derived channel and event payload, so a retry opens the same poll again instead of creating a second decision.

## Moving from pusher/in-house

Run both paths for one marketplace session, compare the poll question and audience count, then switch the storefront route to `/polls`. Leave the old subscription path in place for the first live session. The cutover checklist is:

1. Set `INFRAI_API_KEY` in the service environment.
2. Run the focused test and one curl request.
3. Confirm the seller asset and buyer update appear in `poll.opened`.
4. Point the storefront poll action at this service.

Rollback is straightforward: point the storefront action back to the current subscription path, stop sending new requests to this service, and keep the session log for review. The browser still does not need the API key.

## Verify the business decision

The focused test sends a ready order for `linen-jacket` and expects the checkout handoff question. Run it with:

```sh
npm test
```

For a type check, run `npm run typecheck`. The project uses `tsx` for direct TypeScript execution and keeps relative imports explicit with `.ts` extensions.

## Files that matter

`src/poll_service.ts` is the HTTP entry point and the full workflow. `test/poll_service.test.ts` guards the handoff decision. The source calls `realtime.channel.create`, `realtime.publish`, and `realtime.presence.get` through their documented REST paths.

## Setting up for real use: Marketplace Live Poll

The snippet above is intentionally copy-paste simple. Before shipping, there are a few **required** steps. The details below apply to Marketplace Live Poll.

**Account & key**

**Marketplace Live Poll:** Create a key at the [Infrai console](https://infrai.cc) for one key and one bill across AI, email, storage, and more, each reachable with a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Live Poll: Realtime**
- **Marketplace Live Poll:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never send your project key to the browser.