import { Client, connect } from "ts-postgres";
import { createPool, Pool } from "generic-pool";

export interface DatabaseConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  bigints?: boolean;
  keepAlive?: boolean;
}

let connectionPool: Pool<Client> | null = null;
let singletonClient: Client | null = null;

// DATABASE_PORT was plumbed through Terraform and the site Dockerfile but never
// read here, so connections always went to ts-postgres' default 5432. In
// production that happened to be correct; against a Testcontainers postgres,
// which is published on a random host port, it silently pointed the pool at
// localhost:5432 instead of the container. Left undefined when unset so the
// driver default still applies.
const getDbConfig = (): DatabaseConfig => ({
  host: process.env.DATABASE_HOST!,
  port: process.env.DATABASE_PORT ? Number(process.env.DATABASE_PORT) : undefined,
  database: process.env.DATABASE_NAME!,
  user: process.env.DATABASE_USER!,
  password: process.env.DATABASE_PASSWORD!,
  bigints: false,
  keepAlive: false,
});

export function getPool(): Pool<Client> {
  if (!connectionPool) {
    const dbConfig = getDbConfig();
    
    const factory = {
      create: async (): Promise<Client> => {
        const client = await connect(dbConfig);
        console.log("Pool client created");
        return client;
      },
      destroy: async (client: Client): Promise<void> => {
        await client.end();
        console.log("Pool client destroyed");
      },
      validate: async (client: Client): Promise<boolean> => {
        return !client.closed;
      },
    };

    connectionPool = createPool(factory, {
      max: 10,
      min: 2,
      acquireTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      evictionRunIntervalMillis: 30_000,
    });

    console.log("Connection pool created");
  }
  return connectionPool;
}

export async function withPooledClient<T>(
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.acquire();

  try {
    return await fn(client);
  } finally {
    await pool.release(client);
  }
}

// Legacy singleton client for backward compatibility (deprecated)
export async function getDatabase(): Promise<Client> {
  console.log(`getDatabase() HOST=${process.env.DATABASE_HOST} client==null=${singletonClient == null}`);
  
  if (!singletonClient || singletonClient.closed) {
    const dbConfig = getDbConfig();
    singletonClient = await connect(dbConfig);
    console.log("Singleton client connected");
  }
  return singletonClient;
}

// Test client management for unit tests
export function setTestClient(client: Client) {
  singletonClient = client;
}

export async function closeAllConnections() {
  if (singletonClient) {
    await singletonClient.end();
    singletonClient = null;
  }
  if (connectionPool) {
    await connectionPool.drain();
    await connectionPool.clear();
    connectionPool = null;
  }
}

// Re-export ts-postgres types for convenience
export type { Client } from "ts-postgres";