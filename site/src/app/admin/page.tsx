'use client';

import { useCallback, useEffect, useState } from 'react';
import MapScene from "@ui/map/MapScene";
import { WebhookEvent, TaskExecution, MonitoringStats, AnalyticsSummary } from '@model/admin';
import { ATHLETE_CAPACITY } from '@model/signup';
import { PanelEmpty, PanelHeader, PanelSection } from '@ui/chrome/Panel';
import styles from './Admin.module.css';

/** Percentage of `total`, or an em dash when there is nothing to divide by. */
function formatRate(part: number, total: number): string {
    if (!total) return '—';
    return `${Math.round((part / total) * 100)}%`;
}

/**
 * Accept either a bare array or `{ <key>: [...] }`, and never return undefined.
 * The routes return the former; tolerating the latter costs nothing and means
 * wrapping the payload later cannot silently blank the page.
 */
function asArray<T>(payload: unknown, key: string): T[] {
    if (Array.isArray(payload)) return payload as T[];
    const wrapped = (payload as Record<string, unknown> | null)?.[key];
    return Array.isArray(wrapped) ? (wrapped as T[]) : [];
}

function formatDuration(ms: number | null): string {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Rendered only after mount (see `mounted` below). `toLocaleString` reads the
 * machine's locale and timezone, which differ between the server and the
 * browser, so calling it during render is a hydration mismatch.
 */
function formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
}

const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'tasks', label: 'Tasks' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** One number and its footnote. */
function Stat({
    label,
    value,
    unit,
    note,
    tone,
}: {
    label: string;
    value: number | string;
    unit?: string;
    note?: string;
    tone?: 'bad';
}) {
    return (
        <div className={styles.stat}>
            <dt className={styles.statLabel}>{label}</dt>
            <dd className={styles.statValue} data-tone={tone}>
                {value}
                {unit && <span className={styles.statUnit}>{unit}</span>}
            </dd>
            {note && <p className={styles.statNote}>{note}</p>}
        </div>
    );
}

/**
 * A webhook event or a task execution. The two shapes carry the same
 * information under different field names, so the row takes the resolved
 * values rather than a union it would have to narrow.
 */
function EventRow({
    status,
    name,
    meta,
    when,
    duration,
    error,
}: {
    status: string;
    name: string;
    meta: string;
    when: string | null;
    duration: number | null;
    error: string | null;
}) {
    return (
        <li className={styles.event}>
            <span className={styles.pill} data-status={status.toLowerCase()}>
                {status}
            </span>
            <div className={styles.eventBody}>
                <div className={styles.eventName}>{name}</div>
                <p className={styles.eventMeta}>{meta}</p>
                {error && <p className={styles.eventError}>{error}</p>}
            </div>
            <div className={styles.eventWhen}>
                {when ?? '—'}
                <span className={styles.eventDuration}>{formatDuration(duration)}</span>
            </div>
        </li>
    );
}

/**
 * Webhook and task monitoring.
 *
 * Rebuilt on the panel primitives. It previously wore 69 Tailwind utility class
 * names and Tailwind is not a dependency of this project, so none of them
 * resolved: the page rendered as an unstyled stack of divs.
 *
 * One thing deliberately *not* rebuilt: the per-row Retry buttons. They POSTed
 * to /api/admin/webhooks/:id/retry and /api/admin/tasks/:id/retry, and neither
 * route exists — the only admin routes are analytics, monitoring/stats, tasks
 * and webhooks, all GET. Every click 404d and surfaced as an `alert()`. Rather
 * than invent a retry pipeline that would have to reach into Cloud Tasks, the
 * buttons are gone and the gap is stated on the page.
 */
export default function AdminMonitoringPage() {
    const [stats, setStats] = useState<MonitoringStats | null>(null);
    const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
    const [tasks, setTasks] = useState<TaskExecution[]>([]);
    const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    // Timestamps are locale- and timezone-formatted, so they are held back
    // until the client has taken over. Server and browser disagree otherwise.
    const [mounted, setMounted] = useState(false);

    const fetchMonitoringData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch stats, webhooks, and tasks in parallel
            const [statsRes, webhooksRes, tasksRes] = await Promise.all([
                fetch('/api/admin/monitoring/stats'),
                fetch('/api/admin/webhooks?limit=20'),
                fetch('/api/admin/tasks?limit=20')
            ]);

            if (!statsRes.ok) throw new Error('Failed to fetch stats');
            if (!webhooksRes.ok) throw new Error('Failed to fetch webhooks');
            if (!tasksRes.ok) throw new Error('Failed to fetch tasks');

            const [statsData, webhooksData, tasksData] = await Promise.all([
                statsRes.json(),
                webhooksRes.json(),
                tasksRes.json()
            ]);

            setStats(statsData);
            // Both routes return a bare array. This read `webhooksData.webhooks`
            // and `tasksData.tasks`, which are undefined against the routes as
            // written, so the two lists were always empty and any code that
            // touched them threw.
            setWebhooks(asArray<WebhookEvent>(webhooksData, 'webhooks'));
            setTasks(asArray<TaskExecution>(tasksData, 'tasks'));
            setUpdatedAt(new Date());

            // Fetched separately and never allowed to fail the page. Analytics
            // depends on a table that is applied by hand (see
            // create_analytics_events.sql); until that migration is run the
            // route 500s, and webhook/task monitoring is more important than
            // the signup funnel.
            try {
                const analyticsRes = await fetch('/api/admin/analytics?hours=168');
                if (!analyticsRes.ok) throw new Error(`HTTP ${analyticsRes.status}`);
                setAnalytics(await analyticsRes.json());
                setAnalyticsError(null);
            } catch (analyticsErr) {
                setAnalytics(null);
                setAnalyticsError(analyticsErr instanceof Error ? analyticsErr.message : 'Unknown error');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setMounted(true);
        fetchMonitoringData();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchMonitoringData, 30000);
        return () => clearInterval(interval);
    }, [fetchMonitoringData]);

    const failedWebhooks = webhooks.filter(webhook => webhook.status === 'failed').length;
    const failedTasks = tasks.filter(task => task.status === 'failed').length;
    const badge: Partial<Record<TabId, number>> = {
        webhooks: failedWebhooks,
        tasks: failedTasks,
    };

    return (
        <>
            {/* Opaque: tables this dense are unreadable over imagery, however
                blurred. The map stays mounted and simply stops painting. */}
            <MapScene chrome="opaque"/>

            <PanelHeader
                title="Monitoring"
                subtitle="Strava webhooks and background task executions, refreshed every 30 seconds."
            />

            <div className={styles.toolbar}>
                <button
                    type="button"
                    onClick={fetchMonitoringData}
                    disabled={loading}
                    className={styles.refresh}
                >
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
                <span className={styles.updated}>
                    {mounted && updatedAt
                        ? `Updated ${updatedAt.toLocaleTimeString()}`
                        : 'Not yet loaded'}
                </span>
            </div>

            {error ? (
                <PanelEmpty
                    title="We could not load the monitoring data"
                    detail={error}
                />
            ) : loading && !stats ? (
                <div className={styles.loading}>
                    <span className={styles.spinner} aria-hidden="true"/>
                    Loading monitoring data…
                </div>
            ) : (
                <>
                    <div className={styles.tabs} role="tablist" aria-label="Monitoring views">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                id={`admin-tab-${tab.id}`}
                                aria-selected={activeTab === tab.id}
                                aria-controls={`admin-panel-${tab.id}`}
                                onClick={() => setActiveTab(tab.id)}
                                className={styles.tab}
                            >
                                {tab.label}
                                {badge[tab.id] ? (
                                    <span className={styles.tabBadge}>{badge[tab.id]}</span>
                                ) : null}
                            </button>
                        ))}
                    </div>

                    <div
                        role="tabpanel"
                        id={`admin-panel-${activeTab}`}
                        aria-labelledby={`admin-tab-${activeTab}`}
                    >
                        {activeTab === 'overview' && stats && (
                            <div className={styles.stack}>
                                <dl className={styles.stats}>
                                    <Stat
                                        label="Webhook events"
                                        value={stats.webhooks.total_events}
                                        note={`${stats.webhooks.success_rate}% succeeded`}
                                    />
                                    <Stat
                                        label="Task executions"
                                        value={stats.tasks.total_executions}
                                        note={`${stats.tasks.success_rate}% succeeded`}
                                    />
                                    <Stat
                                        label="Failures"
                                        value={stats.webhooks.failed_events + stats.tasks.failed_executions}
                                        tone={
                                            stats.webhooks.failed_events + stats.tasks.failed_executions > 0
                                                ? 'bad'
                                                : undefined
                                        }
                                        note={`${stats.webhooks.failed_events} webhook, ${stats.tasks.failed_executions} task`}
                                    />
                                    <Stat
                                        label="Avg webhook time"
                                        value={formatDuration(stats.webhooks.avg_processing_time_ms)}
                                        note={`Tasks ${formatDuration(stats.tasks.avg_execution_time_ms)}`}
                                    />
                                </dl>
                                <p className={styles.note}>
                                    Counted over the last {stats.period_hours} hours.
                                </p>
                            </div>
                        )}

                        {activeTab === 'analytics' && (
                            <div className={styles.stack}>
                                {analyticsError && (
                                    <div className={styles.warning}>
                                        <p>Analytics unavailable: {analyticsError}</p>
                                        <p>
                                            If this is the first deploy, apply{' '}
                                            <code>functions/src/model/database/scripts/create_analytics_events.sql</code>
                                            {' '}and <code>add_created_at_to_pilots.sql</code> to the database.
                                        </p>
                                    </div>
                                )}

                                {analytics && (
                                    <>
                                        <p className={styles.note}>
                                            Last {analytics.period_hours} hours. Landings are home page visits;
                                            the Strava description footer is a bare domain, so every click from
                                            an activity arrives here indistinguishable from direct traffic.
                                            Bots excluded.
                                        </p>

                                        <dl className={styles.stats}>
                                            <Stat
                                                label="Landings"
                                                value={analytics.unique_landings}
                                                note={`${analytics.landings} views · ${analytics.bot_landings} bot`}
                                            />
                                            <Stat
                                                label="Signup attempts"
                                                value={analytics.unique_signup_clicks}
                                                note={`${analytics.signup_clicks} clicks · ${formatRate(analytics.unique_signup_clicks, analytics.unique_landings)} of landings`}
                                            />
                                            <Stat
                                                label="Signups completed"
                                                value={analytics.signups_completed}
                                                note={`${formatRate(analytics.signups_completed, analytics.unique_signup_clicks)} of attempts`}
                                            />
                                            <Stat
                                                label="Capacity"
                                                value={analytics.pilots_total}
                                                unit={`/${ATHLETE_CAPACITY}`}
                                                note={`${Math.max(0, ATHLETE_CAPACITY - analytics.pilots_total)} spots left`}
                                            />
                                        </dl>

                                        <p className={styles.note}>
                                            Pilots who connected before signup timestamps were recorded have no
                                            created_at and are counted in Capacity but never in Signups completed.
                                        </p>
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'webhooks' && (
                            <PanelSection title="Latest 20 webhook events from Strava">
                                {webhooks.length > 0 ? (
                                    <ul className={styles.events}>
                                        {webhooks.map(webhook => (
                                            <EventRow
                                                key={webhook.id}
                                                status={webhook.status}
                                                name={`${webhook.event_type} ${webhook.object_type}`}
                                                meta={`Object ${webhook.object_id} · Pilot ${webhook.pilot_id ?? '—'}`}
                                                when={mounted ? formatDateTime(webhook.received_at) : null}
                                                duration={webhook.processing_duration_ms}
                                                error={webhook.error_message}
                                            />
                                        ))}
                                    </ul>
                                ) : (
                                    <PanelEmpty title="No webhook events recorded"/>
                                )}
                                <RetryNote/>
                            </PanelSection>
                        )}

                        {activeTab === 'tasks' && (
                            <PanelSection title="Latest 20 task executions">
                                {tasks.length > 0 ? (
                                    <ul className={styles.events}>
                                        {tasks.map(task => (
                                            <EventRow
                                                key={task.id}
                                                status={task.status}
                                                name={task.task_name}
                                                meta={`Triggered by ${task.triggered_by ?? 'unknown'} · Pilot ${task.pilot_id ?? '—'}`}
                                                when={mounted ? formatDateTime(task.started_at) : null}
                                                duration={task.execution_duration_ms}
                                                error={task.error_message}
                                            />
                                        ))}
                                    </ul>
                                ) : (
                                    <PanelEmpty title="No task executions recorded"/>
                                )}
                                <RetryNote/>
                            </PanelSection>
                        )}
                    </div>
                </>
            )}
        </>
    );
}

/**
 * States the missing capability rather than offering a button that 404s.
 */
function RetryNote() {
    return (
        <p className={styles.retryNote}>
            Retrying a failed item from here is not implemented — there is no retry
            endpoint behind it. Re-run the task from Cloud Tasks, or let Strava resend
            the webhook.
        </p>
    );
}
