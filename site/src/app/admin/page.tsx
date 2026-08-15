'use client';

import { useState, useEffect } from 'react';
import { WebhookEvent, TaskExecution, MonitoringStats, AnalyticsSummary } from '@model/admin';
import { ATHLETE_CAPACITY } from '@model/signup';

/** Percentage of `total`, or an em dash when there is nothing to divide by. */
function formatRate(part: number, total: number): string {
    if (!total) return '—';
    return `${Math.round((part / total) * 100)}%`;
}

export default function AdminMonitoringPage() {
    const [stats, setStats] = useState<MonitoringStats | null>(null);
    const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
    const [tasks, setTasks] = useState<TaskExecution[]>([]);
    const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'webhooks' | 'tasks'>('overview');

    useEffect(() => {
        fetchMonitoringData();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchMonitoringData, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchMonitoringData = async () => {
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
            setWebhooks(webhooksData.webhooks);
            setTasks(tasksData.tasks);

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
    };

    const retryWebhook = async (webhookId: string) => {
        try {
            const response = await fetch(`/api/admin/webhooks/${webhookId}/retry`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error('Failed to retry webhook');
            }
            
            // Refresh data
            fetchMonitoringData();
        } catch (err) {
            alert(`Error retrying webhook: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const retryTask = async (taskId: string) => {
        try {
            const response = await fetch(`/api/admin/tasks/${taskId}/retry`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error('Failed to retry task');
            }
            
            // Refresh data
            fetchMonitoringData();
        } catch (err) {
            alert(`Error retrying task: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const formatDuration = (ms: number | null) => {
        if (!ms) return 'N/A';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'completed': return 'text-green-600 bg-green-100';
            case 'failed': return 'text-red-600 bg-red-100';
            case 'running': case 'processing': return 'text-blue-600 bg-blue-100';
            case 'pending': return 'text-yellow-600 bg-yellow-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    if (loading && !stats) {
        return (
            <div className="min-h-screen bg-gray-50 p-8">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-4 text-gray-600">Loading monitoring data...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 p-8">
                <div className="max-w-7xl mx-auto">
                    <div className="bg-red-50 border border-red-200 rounded-md p-4">
                        <div className="flex">
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-red-800">Error loading monitoring data</h3>
                                <div className="mt-2 text-sm text-red-700">
                                    <p>{error}</p>
                                </div>
                                <div className="mt-4">
                                    <button
                                        onClick={fetchMonitoringData}
                                        className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200"
                                    >
                                        Retry
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="py-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Admin Monitoring</h1>
                                <p className="mt-1 text-sm text-gray-500">
                                    Real-time monitoring of webhooks and task executions
                                </p>
                            </div>
                            <div className="flex items-center space-x-4">
                                <button
                                    onClick={fetchMonitoringData}
                                    disabled={loading}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-md text-sm font-medium"
                                >
                                    {loading ? 'Refreshing...' : 'Refresh'}
                                </button>
                                <span className="text-sm text-gray-500">
                                    Last updated: {new Date().toLocaleTimeString()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Tabs */}
                <div className="border-b border-gray-200 mb-8">
                    <nav className="-mb-px flex space-x-8">
                        {[
                            { id: 'overview', label: 'Overview' },
                            { id: 'analytics', label: 'Analytics' },
                            { id: 'webhooks', label: 'Webhooks' },
                            { id: 'tasks', label: 'Tasks' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                    activeTab === tab.id
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Analytics Tab */}
                {activeTab === 'analytics' && (
                    <div className="space-y-8">
                        {analyticsError && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 text-sm text-yellow-800">
                                <p className="font-medium">Analytics unavailable: {analyticsError}</p>
                                <p className="mt-1">
                                    If this is the first deploy, apply
                                    <code className="mx-1 px-1 bg-yellow-100 rounded">
                                        functions/src/model/database/scripts/create_analytics_events.sql
                                    </code>
                                    and
                                    <code className="mx-1 px-1 bg-yellow-100 rounded">
                                        add_created_at_to_pilots.sql
                                    </code>
                                    to the database.
                                </p>
                            </div>
                        )}

                        {analytics && (
                            <>
                                <div>
                                    <h2 className="text-lg font-medium text-gray-900">Signup funnel</h2>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Last {analytics.period_hours} hours. Landings are home page visits;
                                        the Strava description footer is a bare domain, so every click from
                                        an activity arrives here indistinguishable from direct traffic.
                                        Bots excluded.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div className="bg-white overflow-hidden shadow rounded-lg p-5">
                                        <dt className="text-sm font-medium text-gray-500 truncate">Landings</dt>
                                        <dd className="text-3xl font-semibold text-gray-900">{analytics.unique_landings}</dd>
                                        <div className="mt-2 text-sm text-gray-500">
                                            {analytics.landings} views &middot; {analytics.bot_landings} bot
                                        </div>
                                    </div>

                                    <div className="bg-white overflow-hidden shadow rounded-lg p-5">
                                        <dt className="text-sm font-medium text-gray-500 truncate">Signup attempts</dt>
                                        <dd className="text-3xl font-semibold text-gray-900">{analytics.unique_signup_clicks}</dd>
                                        <div className="mt-2 text-sm text-gray-500">
                                            {analytics.signup_clicks} clicks &middot; {formatRate(analytics.unique_signup_clicks, analytics.unique_landings)} of landings
                                        </div>
                                    </div>

                                    <div className="bg-white overflow-hidden shadow rounded-lg p-5">
                                        <dt className="text-sm font-medium text-gray-500 truncate">Signups completed</dt>
                                        <dd className="text-3xl font-semibold text-gray-900">{analytics.signups_completed}</dd>
                                        <div className="mt-2 text-sm text-gray-500">
                                            {formatRate(analytics.signups_completed, analytics.unique_signup_clicks)} of attempts
                                        </div>
                                    </div>

                                    <div className="bg-white overflow-hidden shadow rounded-lg p-5">
                                        <dt className="text-sm font-medium text-gray-500 truncate">Capacity</dt>
                                        <dd className="text-3xl font-semibold text-gray-900">
                                            {analytics.pilots_total}<span className="text-lg text-gray-400">/{ATHLETE_CAPACITY}</span>
                                        </dd>
                                        <div className="mt-2 text-sm text-gray-500">
                                            {Math.max(0, ATHLETE_CAPACITY - analytics.pilots_total)} spots left
                                        </div>
                                    </div>
                                </div>

                                <p className="text-sm text-gray-500">
                                    Pilots who connected before signup timestamps were recorded have no
                                    created_at and are counted in Capacity but never in Signups completed.
                                </p>
                            </>
                        )}
                    </div>
                )}

                {/* Overview Tab */}
                {activeTab === 'overview' && stats && (
                    <div className="space-y-8">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-white overflow-hidden shadow rounded-lg">
                                <div className="p-5">
                                    <div className="flex items-center">
                                        <div className="flex-shrink-0">
                                            <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                                                <span className="text-white text-sm font-medium">W</span>
                                            </div>
                                        </div>
                                        <div className="ml-5 w-0 flex-1">
                                            <dl>
                                                <dt className="text-sm font-medium text-gray-500 truncate">
                                                    Webhook Events
                                                </dt>
                                                <dd className="text-lg font-medium text-gray-900">
                                                    {stats.webhooks.total_events}
                                                </dd>
                                            </dl>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-sm text-gray-500">
                                        {stats.webhooks.success_rate}% success rate
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white overflow-hidden shadow rounded-lg">
                                <div className="p-5">
                                    <div className="flex items-center">
                                        <div className="flex-shrink-0">
                                            <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                                                <span className="text-white text-sm font-medium">T</span>
                                            </div>
                                        </div>
                                        <div className="ml-5 w-0 flex-1">
                                            <dl>
                                                <dt className="text-sm font-medium text-gray-500 truncate">
                                                    Task Executions
                                                </dt>
                                                <dd className="text-lg font-medium text-gray-900">
                                                    {stats.tasks.total_executions}
                                                </dd>
                                            </dl>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-sm text-gray-500">
                                        {stats.tasks.success_rate}% success rate
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white overflow-hidden shadow rounded-lg">
                                <div className="p-5">
                                    <div className="flex items-center">
                                        <div className="flex-shrink-0">
                                            <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                                                <span className="text-white text-sm font-medium">F</span>
                                            </div>
                                        </div>
                                        <div className="ml-5 w-0 flex-1">
                                            <dl>
                                                <dt className="text-sm font-medium text-gray-500 truncate">
                                                    Failed Events
                                                </dt>
                                                <dd className="text-lg font-medium text-gray-900">
                                                    {stats.webhooks.failed_events + stats.tasks.failed_executions}
                                                </dd>
                                            </dl>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-sm text-gray-500">
                                        Webhooks: {stats.webhooks.failed_events}, Tasks: {stats.tasks.failed_executions}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white overflow-hidden shadow rounded-lg">
                                <div className="p-5">
                                    <div className="flex items-center">
                                        <div className="flex-shrink-0">
                                            <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                                                <span className="text-white text-sm font-medium">⏱</span>
                                            </div>
                                        </div>
                                        <div className="ml-5 w-0 flex-1">
                                            <dl>
                                                <dt className="text-sm font-medium text-gray-500 truncate">
                                                    Avg Processing Time
                                                </dt>
                                                <dd className="text-lg font-medium text-gray-900">
                                                    {formatDuration(stats.webhooks.avg_processing_time_ms)}
                                                </dd>
                                            </dl>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-sm text-gray-500">
                                        Tasks: {formatDuration(stats.tasks.avg_execution_time_ms)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Webhooks Tab */}
                {activeTab === 'webhooks' && (
                    <div className="bg-white shadow overflow-hidden sm:rounded-md">
                        <div className="px-4 py-5 sm:px-6">
                            <h3 className="text-lg leading-6 font-medium text-gray-900">Recent Webhook Events</h3>
                            <p className="mt-1 max-w-2xl text-sm text-gray-500">
                                Latest 20 webhook events received from Strava
                            </p>
                        </div>
                        <ul className="divide-y divide-gray-200">
                            {webhooks.map((webhook) => (
                                <li key={webhook.id} className="px-4 py-4 sm:px-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0">
                                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(webhook.status)}`}>
                                                    {webhook.status}
                                                </span>
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {webhook.event_type} {webhook.object_type}
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    Object ID: {webhook.object_id} • Pilot ID: {webhook.pilot_id || 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-4">
                                            <div className="text-right">
                                                <div className="text-sm text-gray-900">
                                                    {formatDateTime(webhook.received_at)}
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    {formatDuration(webhook.processing_duration_ms)}
                                                </div>
                                            </div>
                                            {webhook.status === 'failed' && (
                                                <button
                                                    onClick={() => retryWebhook(webhook.id)}
                                                    className="bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1 rounded text-sm"
                                                >
                                                    Retry
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {webhook.error_message && (
                                        <div className="mt-2 text-sm text-red-600">
                                            Error: {webhook.error_message}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Tasks Tab */}
                {activeTab === 'tasks' && (
                    <div className="bg-white shadow overflow-hidden sm:rounded-md">
                        <div className="px-4 py-5 sm:px-6">
                            <h3 className="text-lg leading-6 font-medium text-gray-900">Recent Task Executions</h3>
                            <p className="mt-1 max-w-2xl text-sm text-gray-500">
                                Latest 20 task executions with their status and duration
                            </p>
                        </div>
                        <ul className="divide-y divide-gray-200">
                            {tasks.map((task) => (
                                <li key={task.id} className="px-4 py-4 sm:px-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0">
                                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(task.status)}`}>
                                                    {task.status}
                                                </span>
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {task.task_name}
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    Triggered by: {task.triggered_by || 'Unknown'} • Pilot ID: {task.pilot_id || 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-4">
                                            <div className="text-right">
                                                <div className="text-sm text-gray-900">
                                                    {formatDateTime(task.started_at)}
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    {formatDuration(task.execution_duration_ms)}
                                                </div>
                                            </div>
                                            {task.status === 'failed' && (
                                                <button
                                                    onClick={() => retryTask(task.id)}
                                                    className="bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1 rounded text-sm"
                                                >
                                                    Retry
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {task.error_message && (
                                        <div className="mt-2 text-sm text-red-600">
                                            Error: {task.error_message}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}