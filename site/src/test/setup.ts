import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { connect, Client } from "ts-postgres";
import * as fs from "node:fs";
import * as path from "node:path";

export class TestDatabaseSetup {
  private static container: StartedPostgreSqlContainer | null = null;
  private static client: Client | null = null;

  static async createTestDatabase(): Promise<{ container: StartedPostgreSqlContainer | null; client: Client }> {
    if (this.client) {
      return { container: this.container, client: this.client };
    }

    // First try existing database connection for faster testing
    try {
      this.client = await connect({
        host: 'localhost',
        database: 'local',
        user: 'functions',
        password: 'password',
        port: 5432,
      });
      
      // Create and connect to a clean test database
      await this.client.query('DROP DATABASE IF EXISTS test_ploufbag');
      await this.client.query('CREATE DATABASE test_ploufbag');
      await this.client.end();
      
      // Connect to the test database
      this.client = await connect({
        host: 'localhost',
        database: 'test_ploufbag',
        user: 'functions',
        password: 'password',
        port: 5432,
      });
      
      console.log('Using existing PostgreSQL instance on localhost:5432');
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

  private static async loadSchema(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    // Read and execute schema files
    const scriptsDir = path.resolve(__dirname, '../../../functions/src/model/database/scripts');
    const schemaFiles = [
      'create_pilots.sql',
      'create_flights.sql', 
      'create_sites.sql',
      'create_description_preferences.sql',
      'create_monitoring_tables.sql'
    ];

    for (const fileName of schemaFiles) {
      const filePath = path.join(scriptsDir, fileName);
      try {
        if (!fs.existsSync(filePath)) {
          console.warn(`Schema file not found: ${filePath}`);
          continue;
        }
        
        const sqlContent = fs.readFileSync(filePath, 'utf8');
        
        // Handle different SQL file formats in the project
        try {
          if (sqlContent.includes(';;;')) {
            // Files with triple semicolon separators - split and execute separately
            const queries = sqlContent.split(';;;').map(q => q.trim()).filter(q => q);
            for (let i = 0; i < queries.length; i++) {
              const query = queries[i];
              try {
                console.log(`Executing query ${i + 1}/${queries.length} in ${fileName}`);
                await this.client!.query(query);
              } catch (queryError: any) {
                if (queryError.message?.includes('already exists') ||
                    queryError.code === '42P07' || queryError.code === '42710' || queryError.code === '42723') {
                  console.log(`Ignoring existing object error in ${fileName}`);
                } else {
                  throw queryError;
                }
              }
            }
          } else {
            // Files with regular SQL statements - need to parse them carefully
            console.log(`Parsing and executing SQL file: ${fileName}`);
            const queries = this.parseSQLStatements(sqlContent);
            
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

  private static parseSQLStatements(sqlContent: string): string[] {
    // Remove comments and normalize whitespace
    const cleaned = sqlContent
      .replace(/--[^\n]*\n/g, '\n') // Remove line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    const statements: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let parenCount = 0;

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      const prev = i > 0 ? cleaned[i - 1] : '';

      if (!inString) {
        if (char === "'" || char === '"') {
          inString = true;
          stringChar = char;
        } else if (char === '(') {
          parenCount++;
        } else if (char === ')') {
          parenCount--;
        } else if (char === ';' && parenCount === 0) {
          // End of statement
          if (current.trim()) {
            statements.push(current.trim());
            current = '';
            continue;
          }
        }
      } else {
        if (char === stringChar && prev !== '\\') {
          inString = false;
          stringChar = '';
        }
      }

      current += char;
    }

    // Add the last statement if it exists
    if (current.trim()) {
      statements.push(current.trim());
    }

    return statements.filter(s => s && s !== ';');
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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