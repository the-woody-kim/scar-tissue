import { MongoClient, type Db } from "mongodb";

// One client per process. Next dev reloads modules, so keep it on globalThis.
const g = globalThis as unknown as { __st_mongo?: Promise<MongoClient> };

export async function db(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Set MONGODB_URI in .env.local");
  // A failed connect is not cached: the next request tries again.
  g.__st_mongo ??= new MongoClient(uri, { appName: "scar-tissue", serverSelectionTimeoutMS: 10_000 })
    .connect()
    .catch((e) => {
      g.__st_mongo = undefined;
      const servers = e?.reason?.servers as Map<string, { error?: { message?: string } }> | undefined;
      console.error("mongo connect failed:", e?.message, servers ? [...servers].map(([h, s]) => `${h} ${s.error?.message ?? ""}`) : "");
      throw e;
    });
  return (await g.__st_mongo).db(process.env.MONGODB_DB || "scar_tissue");
}
