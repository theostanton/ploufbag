import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { connect, Client } from "ts-postgres";
import * as fs from "node:fs";
import * as path from "node:path";
import { splitStatements } from '@ploufbag/common';

/**
 * Where to look for an already-running Postgres before reaching for Docker.
 *
 * These were hard-coded to localhost:5432 / functions / local, which is the one
 * arrangement `docker compose up` produces. Anywhere else — including the
 * dev/db.sh cluster this repo's own harness starts on 5433 — the local attempt
 * could only fail, and the suite fell through to Testcontainers and died on
 * machines without a container runtime. Reading the same DATABASE_* variables
 * the site itself uses means `eval $(dev/db.sh env) && yarn test` just works.
 *
 * The defaults are unchanged, so compose-based setups behave exactly as before.
 */
const LOCAL_DB = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USER || 'functions',
  password: process.env.DATABASE_PASSWORD ?? 'password',
  // The database to connect to in order to issue CREATE DATABASE; the tests
  // then work inside test_ploufbag regardless.
  database: process.env.DATABASE_NAME || 'local',
};

/**
 * One scratch database per Vitest worker.
 *
 * It was a single `test_ploufbag` shared by every test file, and each file
 * begins by dropping and recreating it. Vitest runs files in parallel workers,
 * so the second file to start would drop the database the first was connected
 * to and every subsequent query in that file failed with "Connection is
 * closed". Naming it per worker makes the drop local to the worker that owns
 * it; files that share a worker are serialised by Vitest and share the client
 * via the early return in createTestDatabase.
 */
const TEST_DB_NAME = `test_ploufbag_${process.env.VITEST_WORKER_ID ?? '0'}`;

export class TestDatabaseSetup {
  private static container: StartedPostgreSqlContainer | null = null;
  private static client: Client | null = null;

  static async createTestDatabase(): Promise<{ container: StartedPostgreSqlContainer | null; client: Client }> {
    if (this.client) {
      return { container: this.container, client: this.client };
    }

    // First try existing database connection for faster testing
    try {
      this.client = await connect({ ...LOCAL_DB });

      // Create and connect to a clean test database
      await this.client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
      await this.client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
      await this.client.end();

      // Connect to the test database
      this.client = await connect({ ...LOCAL_DB, database: TEST_DB_NAME });

      this.pointApplicationAtTestDatabase({ ...LOCAL_DB, database: TEST_DB_NAME });

      console.log(`Using existing PostgreSQL instance on ${LOCAL_DB.host}:${LOCAL_DB.port}`);
      await this.loadSchema();
      
      // Modify tables to use simple IDs for testing (avoid UUID complexity)
      try {
        await this.client.query(`
          ALTER TABLE webhook_events DROP COLUMN id;
          ALTER TABLE webhook_events ADD COLUMN id SERIAL PRIMARY KEY;
        `);
        
        await this.client.query(`
          ALTER TABLE task_executions DROP COLUMN id;
          ALTER TABLE task_executions ADD COLUMN id SERIAL PRIMARY KEY;
        `);
        console.log('Modified tables to use SERIAL IDs for testing');
      } catch (error) {
        console.log('Tables already modified or modification failed, continuing...');
      }
      
      return { container: null, client: this.client };
      
    } catch (localDbError) {
      console.log('Local database not available, trying Testcontainers...'); 
      
      // Fallback to Testcontainers if local DB not available
      try {
        this.container = await new PostgreSqlContainer("postgres:15")
          .withExposedPorts(5432)
          .withEnvironment({
            POSTGRES_DB: "testdb",
            POSTGRES_USER: "testuser", 
            POSTGRES_PASSWORD: "testpass"
          })
          .withStartupTimeout(60_000)
          .start();

        this.client = await connect({
          host: this.container.getHost(),
          database: this.container.getDatabase(),
          user: this.container.getUsername(),
          password: this.container.getPassword(),
          port: this.container.getPort(),
        });

        this.pointApplicationAtTestDatabase({
          host: this.container.getHost(),
          port: this.container.getPort(),
          database: this.container.getDatabase(),
          user: this.container.getUsername(),
          password: this.container.getPassword(),
        });

        await this.loadSchema();

        // Modify tables to use simple IDs for testing (avoid UUID complexity)
        try {
          await this.client.query(`
            ALTER TABLE webhook_events DROP COLUMN id;
            ALTER TABLE webhook_events ADD COLUMN id SERIAL PRIMARY KEY;
          `);
          
          await this.client.query(`
            ALTER TABLE task_executions DROP COLUMN id;
            ALTER TABLE task_executions ADD COLUMN id SERIAL PRIMARY KEY;
          `);
          console.log('Modified tables to use SERIAL IDs for testing');
        } catch (error) {
          console.log('Tables already modified or modification failed, continuing...');
        }
        
        return { container: this.container, client: this.client };
        
      } catch (containerError) {
        throw new Error(`Both local DB and Testcontainer failed: ${containerError}`);
      }  
    }
  }

  /**
   * Point the application's own connection pool at the scratch database.
   *
   * The route handlers under test do not take a client — they call
   * withPooledClient, which builds its config from DATABASE_* at first use
   * (see common/src/database.ts). Without this the tests inserted fixtures
   * into the scratch database and the handler read from whatever database the
   * ambient environment named, which is never the same one: every "happy
   * path" assertion failed with `relation "task_executions" does not exist`,
   * or silently read production-shaped data.
   *
   * Safe to do here because the pool is created lazily and nothing in a test
   * process has touched it yet.
   */
  private static pointApplicationAtTestDatabase(config: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  }): void {
    process.env.DATABASE_HOST = config.host;
    process.env.DATABASE_PORT = String(config.port);
    process.env.DATABASE_NAME = config.database;
    process.env.DATABASE_USER = config.user;
    process.env.DATABASE_PASSWORD = config.password;
  }

  private static async loadSchema(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    // Read and execute schema files
    const scriptsDir = path.resolve(__dirname, '../../../functions/src/model/database/scripts');
    // The order lives in manifest.txt, which is also what the deploy applies
    // and what dev/db.sh builds a local cluster from. A list maintained here
    // instead is one that can quietly disagree with production -- and did.
    const schemaFiles = fs
      .readFileSync(path.join(scriptsDir, 'manifest.txt'), 'utf8')
      .split('\n')
      .map(line => line.replace(/#.*/, '').trim())
      .filter(line => line.length > 0)
      .map(name => `${name}.sql`);

    for (const fileName of schemaFiles) {
      const filePath = path.join(scriptsDir, fileName);
      try {
        if (!fs.existsSync(filePath)) {
          console.warn(`Schema file not found: ${filePath}`);
          continue;
        }
        
        const sqlContent = fs.readFileSync(filePath, 'utf8');
        
        // One splitter for every file, whichever convention it was written in.
        // There used to be two paths here -- `;;;` files split naively, and
        // everything else through a local parser that did not know about
        // dollar-quoted plpgsql bodies. Loading the whole manifest brings files
        // of both kinds, including one that is dollar-quoted without `;;;`, so
        // the shared splitter in @ploufbag/common handles both.
        try {
          const queries = splitStatements(sqlContent);

          for (let i = 0; i < queries.length; i++) {
            const query = queries[i];
            try {
              console.log(`Executing statement ${i + 1}/${queries.length} in ${fileName}`);
              await this.client!.query(query);
            } catch (queryError: any) {
              if (queryError.message?.includes('already exists') ||
                  queryError.code === '42P07' || queryError.code === '42710' || queryError.code === '42723') {
                console.log(`Ignoring existing object error in ${fileName}`);
              } else {
                console.error(`Error in statement ${i + 1}:`, query.substring(0, 100) + '...');
                throw queryError;
              }
            }
          }
        } catch (queryError: any) {
          // Handle common errors that can be ignored
          if (queryError.message?.includes('already exists') ||
              queryError.code === '42P07' || // relation already exists
              queryError.code === '42710' || // duplicate object  
              queryError.code === '42723') { // duplicate function
            console.log(`Ignoring existing object error in ${fileName}: ${queryError.message}`);
          } else {
            console.error(`Error executing ${fileName}:`, queryError.message);
            // Don't throw error if we're past the critical tables
            if (fileName !== 'create_monitoring_tables.sql') {
              throw queryError;
            } else {
              console.warn(`Non-critical error in monitoring tables, continuing...`);
            }
          }
        }
        console.log(`Successfully executed schema file: ${fileName}`);
      } catch (error) {
        console.error(`Error reading/executing ${fileName}:`, error);
        throw error;
      }
    }
  }


  static async cleanup(): Promise<void> {
    try {
      if (this.client) {
        await this.client.end();
        this.client = null;
      }
    } catch (error) {
      console.warn('Error closing database client:', error);
    }
    
    try {
      if (this.container) {
        await this.container.stop();
        this.container = null;
      }
    } catch (error) {
      console.warn('Error stopping container:', error);
    }
  }

  static getClient(): Client {
    if (!this.client) {
      throw new Error('Database not initialized. Call createTestDatabase() first.');
    }
    return this.client;
  }

  static async insertTestWebhookEvents(events: Array<{
    event_type: string;
    object_type: string;
    object_id: string;
    pilot_id?: number | null;
    status?: string;
    processing_duration_ms?: number | null;
    received_at?: Date;
    processed_at?: Date | null;
    error_message?: string | null;
    retry_count?: number;
  }>): Promise<void> {
    const client = this.getClient();
    
    for (const event of events) {
      await client.query(`
        INSERT INTO webhook_events (
          event_type, object_type, object_id, pilot_id, status, 
          processing_duration_ms, received_at, processed_at, error_message, 
          retry_count, payload
        )
        -- Every enum column is bound as text and cast here. The status,
        -- event_type and object_type columns are user-defined enums, whose
        -- OIDs differ in every freshly created database; ts-postgres cannot
        -- bind a type it does not know and failed with "Unsupported data type:
        -- <some varying number>", which read as a driver bug rather than as
        -- what it is.
        VALUES ($1::text::webhook_event_type, $2::text::webhook_object_type, $3, $4, $5::text::webhook_event_status, $6, $7, $8, $9, $10, $11)
      `, [
        event.event_type,
        event.object_type,
        event.object_id,
        event.pilot_id || null,
        event.status || 'completed',
        event.processing_duration_ms || null,
        event.received_at || new Date(),
        event.processed_at || new Date(),
        event.error_message || null,
        event.retry_count || 0,
        JSON.stringify({ test: true }) // minimal payload
      ]);
    }
  }

  static async insertTestTaskExecutions(executions: Array<{
    task_name: string;
    triggered_by?: string | null;
    pilot_id?: number | null;
    status?: string;
    execution_duration_ms?: number | null;
    started_at?: Date;
    completed_at?: Date | null;
    error_message?: string | null;
    retry_count?: number;
  }>): Promise<void> {
    const client = this.getClient();
    
    for (const execution of executions) {
      await client.query(`
        INSERT INTO task_executions (
          task_name, task_payload, triggered_by, pilot_id, status,
          execution_duration_ms, started_at, completed_at, error_message, retry_count
        )
        -- $5 is a user-defined enum; see insertTestWebhookEvents above for why
        -- it is bound as text and cast.
        VALUES ($1, $2, $3, $4, $5::text::task_execution_status, $6, $7, $8, $9, $10)
      `, [
        execution.task_name,
        JSON.stringify({ test: true }), // minimal payload
        execution.triggered_by || null,
        execution.pilot_id || null,
        execution.status || 'completed',
        execution.execution_duration_ms || null,
        execution.started_at || new Date(),
        execution.completed_at || new Date(),
        execution.error_message || null,
        execution.retry_count || 0
      ]);
    }
  }
}