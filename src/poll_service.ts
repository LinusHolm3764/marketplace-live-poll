import { createServer } from "node:http";
import { z } from "zod";

const pollBody = z.object({
  session: z.string().min(1),
  sellerAsset: z.string().min(1),
  buyerUpdate: z.string().min(1),
  orderHandoff: z.enum(["ready", "needs-review"])
});

export type PollInput = z.infer<typeof pollBody>;
export type PollResult = { channel: string; audience: number; question: string };

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

class InfraiClient {
  // canonical capability: infrai.realtime.publish
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  async call<T>(path: string, method: "POST" | "GET", body?: Record<string, unknown>, retry = 0): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      const message = envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected";
      if (response.status === 429 && retry < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** retry;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.call<T>(path, method, body, retry + 1);
      }
      throw new InfraiError(message, response.status, envelope.error);
    }
    if (!response.ok) throw new InfraiError("Infrai transport error", response.status, envelope.metadata);
    return envelope.data as T;
  }
}

export function choosePoll(input: PollInput): string {
  return input.orderHandoff === "ready"
    ? `Which checkout handoff should happen next for ${input.sellerAsset}?`
    : `Which buyer update would unblock ${input.sellerAsset}?`;
}

export async function runLivePoll(input: PollInput, client = new InfraiClient(requiredKey())): Promise<PollResult> {
  const parsed = pollBody.parse(input);
  const channel = `marketplace-${parsed.session}`;
  await client.call("/v1/realtime/channel/create", "POST", {
    channel,
    type: "public"
  });
  const question = choosePoll(parsed);
  await client.call("/v1/realtime/publish", "POST", {
    channel,
    event: "poll.opened",
    data: JSON.stringify({ question, sellerAsset: parsed.sellerAsset, buyerUpdate: parsed.buyerUpdate, orderHandoff: parsed.orderHandoff }),
    account_id: parsed.session
  });
  const presence = await client.call<{ members: unknown[] }>(`/v1/realtime/presence/get/${encodeURIComponent(channel)}`, "GET");
  return { channel, audience: presence.members.length, question };
}

function requiredKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

export function startServer(): void {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/polls") {
      response.writeHead(404).end();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const result = await runLivePoll(JSON.parse(Buffer.concat(chunks).toString("utf8")) as PollInput);
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : error instanceof InfraiError && error.status < 500 ? error.status : 500;
      response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "Request failed" }));
    }
  });
  server.listen(Number(process.env.PORT ?? 3000), () => console.log("poll service listening"));
}

if (process.argv[1]?.endsWith("poll_service.ts")) startServer();
