import test from "node:test";
import assert from "node:assert/strict";
import { choosePoll, runLivePoll } from "../src/poll_service.ts";

test("ready order handoff opens a checkout poll", () => {
  assert.equal(choosePoll({
    session: "s-17",
    sellerAsset: "linen-jacket",
    buyerUpdate: "size confirmed",
    orderHandoff: "ready"
  }), "Which checkout handoff should happen next for linen-jacket?");
});

test("audience reflects the presence members roster", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => new Response(JSON.stringify({
    ok: true,
    data: url.includes("/presence/get/")
      ? { channel: "marketplace-s-17", members: [{ id: "buyer-1" }, { id: "buyer-2" }, { id: "buyer-3" }], next_cursor: null }
      : {}
  }), { status: 200 }));
  const previousKey = process.env.INFRAI_API_KEY;
  process.env.INFRAI_API_KEY = "local-test-key";
  try {
    const result = await runLivePoll({
      session: "s-17", sellerAsset: "linen-jacket", buyerUpdate: "size confirmed", orderHandoff: "ready"
    });
    assert.equal(result.audience, 3);
  } finally {
    if (previousKey === undefined) delete process.env.INFRAI_API_KEY;
    else process.env.INFRAI_API_KEY = previousKey;
  }
});
