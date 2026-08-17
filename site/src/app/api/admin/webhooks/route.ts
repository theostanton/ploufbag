import { NextRequest, NextResponse } from 'next/server';
import { withPooledClient } from '@database/client';
import { WebhookEvent } from '@model/admin';

/** See ../tasks/route.ts. */
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

    const [webhookEvents, error] = await withPooledClient(async (database) => {
      try {
        const query = `
          SELECT 
            id,
            event_type,
            object_type,
            object_id,
            pilot_id,
            received_at,
            processed_at,
            status,
            error_message,
            processing_duration_ms,
            retry_count
          FROM webhook_events 
          ORDER BY received_at DESC 
          LIMIT $1
        `;

        const result = await database.query(query, [limit]);

        // See the note in ../tasks/route.ts: without reify() a row is an array,
        // every field read is undefined, and this endpoint 500s on the first
        // timestamp.
        const events: WebhookEvent[] = result.rows.map((row) => {
          const event = row.reify() as any;
          return {
            id: String(event.id),
            event_type: event.event_type,
            object_type: event.object_type,
            object_id: String(event.object_id),
            pilot_id: event.pilot_id,
            received_at: toIso(event.received_at)!,
            processed_at: toIso(event.processed_at),
            status: event.status,
            error_message: event.error_message,
            processing_duration_ms: event.processing_duration_ms,
            retry_count: event.retry_count
          };
        });

        return [events, null];
      } catch (err) {
        return [null, `Database query failed: ${err}`];
      }
    });

    if (error) {
      console.error('Error fetching webhook events:', error);
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json(webhookEvents);
  } catch (error) {
    console.error('Error fetching webhook events:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}