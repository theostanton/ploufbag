export interface WebhookEvent {
    id: string;
    event_type: string;
    object_type: string;
    object_id: string;
    pilot_id: number | null;
    received_at: string;
    processed_at: string | null;
    status: string;
    error_message: string | null;
    processing_duration_ms: number | null;
    retry_count: number;
}

export interface TaskExecution {
    id: string;
    task_name: string;
    triggered_by: string | null;
    started_at: string;
    completed_at: string | null;
    status: string;
    error_message: string | null;
    execution_duration_ms: number | null;
    pilot_id: number | null;
    retry_count: number;
}

/**
 * Mirrors AnalyticsSummary in src/data/database/analytics.ts, which is where
 * the field docs live. Restated here because this module is imported by the
 * client-side admin page and must not pull in the database layer.
 */
export interface AnalyticsSummary {
    period_hours: number;
    landings: number;
    unique_landings: number;
    signup_clicks: number;
    unique_signup_clicks: number;
    signups_completed: number;
    pilots_total: number;
    bot_landings: number;
}

export interface MonitoringStats {
    period_hours: number;
    webhooks: {
        total_events: number;
        completed_events: number;
        failed_events: number;
        pending_events: number;
        success_rate: number;
        avg_processing_time_ms: number;
    };
    tasks: {
        total_executions: number;
        completed_executions: number;
        failed_executions: number;
        running_executions: number;
        pending_executions: number;
        success_rate: number;
        avg_execution_time_ms: number;
    };
}