import { MongoClient, type Db } from "mongodb";

// One client per process. Next dev reloads modules, so keep it on globalThis.
const g = globalThis as unknown as { __st_mongo?: Promise<MongoClient> };

export async function db(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Set MONGODB_URI in .env.local");
  g.__st_mongo ??= new MongoClient(uri, { appName: "scar-tissue" }).connect();
  return (await g.__st_mongo).db(process.env.MONGODB_DB || "scar_tissue");
}
