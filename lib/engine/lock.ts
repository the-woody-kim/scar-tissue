import { randomUUID } from "node:crypto";
import type { BeatId } from "@/lib/state";
import { db } from "./db";

// One run at a time, across every server instance. On Vercel a request can land on any instance,
// so the lock is a document in Atlas, not process memory. A run that dies without releasing it
// holds it for at most TTL_MS.
const TTL_MS = 310_000; // the routes' maxDuration (300 s), plus slack

interface Lock { _id: "run"; running: BeatId | null; token: string | null; until: Date }
const locks = async () => (await db()).collection<Lock>("locks");

// The token to release with, or null when another run holds the lock.
export async function acquire(what: BeatId): Promise<string | null> {
  const token = randomUUID();
  const now = new Date();
  try {
    // Free or expired → take it. Held → the filter misses, the upsert collides on _id, E11000.
    await (await locks()).updateOne(
      { _id: "run", $or: [{ running: null }, { until: { $lt: now } }] },
      { $set: { running: what, token, until: new Date(now.getTime() + TTL_MS) } },
      { upsert: true },
    );
    return token;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return null;
    throw e;
  }
}

export async function release(token: string) {
  await (await locks()).updateOne({ _id: "run", token }, { $set: { running: null, token: null } });
}

export async function holder(): Promise<BeatId | null> {
  const l = await (await locks()).findOne({ _id: "run" });
  return l?.running && l.until > new Date() ? l.running : null;
}
