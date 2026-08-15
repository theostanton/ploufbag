import {isSuccess} from "@ploufbag/common";
import express, {Request, Response} from "express";
import {verifyJwt} from "@/jwt";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import {getSelf} from "./getSelf";
import {getFlights} from "./getFlights";
import {getFlight} from "./getFlight";
import {generateToken} from "./generateToken";
import {getTakeOff} from "./getTakeOff";
import {
    getWebhookEvents,
    getWebhookEventsWithTasks,
    getTaskExecutions,
    getMonitoringActivity,
    getMonitoringStats,
    retryWebhook,
    retryTask,
    retryAllFailed
} from "./admin/monitoring";

const jsonParser = bodyParser.json({})

const app = express();

// Public routes (no auth required)
app.use('/token/', generateToken);
app.use(jsonParser)

// Admin routes (TODO: add admin auth check)
app.get('/admin/webhooks', getWebhookEvents);
app.get('/admin/webhooks/with-tasks', getWebhookEventsWithTasks);
app.get('/admin/tasks', getTaskExecutions);
app.get('/admin/monitoring/activity', getMonitoringActivity);
app.get('/admin/monitoring/stats', getMonitoringStats);
app.post('/admin/webhooks/:id/retry', retryWebhook);
app.post('/admin/tasks/:id/retry', retryTask);
app.post('/admin/monitoring/retry-failed', retryAllFailed);

// Site-specific routes (no auth for now)
app.use('/takeoffs/:id', getTakeOff);
app.use('/landings/:id', getTakeOff);

// User authentication middleware for protected routes
app.use(cookieParser())
app.use(async (req, res, next) => {
    console.log(`verifying req.cookies.sid=${req.cookies.sid}`)
    const userResult = await verifyJwt(req, res);
    if (isSuccess(userResult)) {
        const [user] = userResult;
        console.log(`Verified user=${JSON.stringify(user)}`);
        next()
    } else {
        const [, error] = userResult;
        console.log(`Auth failed error=${error}`)
    }
});

// Protected user routes
app.use('/flights', getFlights);
app.use('/flights/:id', getFlight);
app.use(getSelf);

export {app};