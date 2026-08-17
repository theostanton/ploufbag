import { NextRequest, NextResponse } from 'next/server';
import { withPooledClient } from '@database/client';
import { TaskExecution } from '@model/admin';

/**
 * Timestamps come back as Date from ts-postgres, but a driver or column-type
 * change turning one into a string should not 500 the endpoint.
 */
function toIso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam) : 50;

    if (isNaN(limit) || limit <= 0 || limit > 1000) {
      return NextResponse.json({ error: 'Invalid limit parameter (1-1000)' }, { status: 400 });
    }

    const [taskExecutions, error] = await withPooledClient(async (database) => {
      try {
        const query = `
          SELECT 
            id,
            task_name,
            triggered_by,
            started_at,
            completed_at,
            status,
            error_message,
            execution_duration_ms,
            pilot_id,
            retry_count
          FROM task_executions 
          ORDER BY started_at DESC 
          LIMIT $1
        `;

        const result = await database.query(query, [limit]);

        // reify() is what turns a ts-postgres row into an object keyed by
        // column name; without it a row is an array and every `row.x` is
        // undefined, so the first `.toISOString()` threw and this endpoint
        // returned 500 for every request that reached the database. Every
        // other query in the codebase reifies -- these two admin routes were
        // the exceptions, and the admin page has never shown a task or a
        // webhook because of it.
        const executions: TaskExecution[] = result.rows.map((row) => {
          const task = row.reify() as any;
          return {
            id: String(task.id),
            task_name: task.task_name,
            triggered_by: task.triggered_by,
            started_at: toIso(task.started_at)!,
            completed_at: toIso(task.completed_at),
            status: task.status,
            error_message: task.error_message,
            execution_duration_ms: task.execution_duration_ms,
            pilot_id: task.pilot_id,
            retry_count: task.retry_count
          };
        });

        return [executions, null];
      } catch (err) {
        return [null, `Database query failed: ${err}`];
      }
    });

    if (error) {
      console.error('Error fetching task executions:', error);
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json(taskExecutions);
  } catch (error) {
    console.error('Error fetching task executions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}