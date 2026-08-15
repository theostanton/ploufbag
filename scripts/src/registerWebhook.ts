import axios from 'axios';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface WebhookSubscription {
    id: number;
    callback_url: string;
    created_at: string;
    updated_at: string;
}

async function registerWebhook() {
    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;
    const callbackUrl = process.env.WEBHOOK_CALLBACK_URL || 'https://webhooks.ploufbag.com';
    const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;

    if (!clientId || !clientSecret || !verifyToken) {
        throw new Error("Missing required environment variables: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_WEBHOOK_VERIFY_TOKEN");
    }

    try {
        console.log(`Registering webhook subscription...`);
        console.log(`Callback URL: ${callbackUrl}`);
        console.log(`Verify Token: ${verifyToken}`);

        const response = await axios.post<WebhookSubscription>(
            'https://www.strava.com/api/v3/push_subscriptions',
            {
                client_id: clientId,
                client_secret: clientSecret,
                callback_url: callbackUrl,
                verify_token: verifyToken
            }
        );

        console.log("\n✅ Webhook subscription created successfully!");
        console.log(JSON.stringify(response.data, null, 2));
        console.log(`\nSubscription ID: ${response.data.id}`);
        console.log(`\n⚠️  IMPORTANT: Save the subscription ID for future management operations`);
        console.log(`\n📝 Next steps:`);
        console.log(`1. Note the subscription ID above`);
        console.log(`2. The STRAVA_WEBHOOK_SECRET will be provided in the webhook verification response`);
        console.log(`3. Add STRAVA_WEBHOOK_SECRET to your environment variables`);

        return response.data;
    } catch (error: any) {
        console.error("\n❌ Failed to register webhook:");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.error(error.message);
        }
        throw error;
    }
}

async function listWebhooks() {
    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("Missing required environment variables: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET");
    }

    try {
        console.log("Fetching webhook subscriptions...\n");

        const response = await axios.get<WebhookSubscription[]>(
            `https://www.strava.com/api/v3/push_subscriptions`,
            {
                params: {
                    client_id: clientId,
                    client_secret: clientSecret
                }
            }
        );

        if (response.data.length === 0) {
            console.log("📭 No active webhook subscriptions found");
        } else {
            console.log("📬 Active webhook subscriptions:");
            console.log(JSON.stringify(response.data, null, 2));
        }

        return response.data;
    } catch (error: any) {
        console.error("\n❌ Failed to list webhooks:");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.error(error.message);
        }
        throw error;
    }
}

async function deleteWebhook(subscriptionId: number) {
    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("Missing required environment variables: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET");
    }

    try {
        console.log(`Deleting webhook subscription ${subscriptionId}...\n`);

        await axios.delete(
            `https://www.strava.com/api/v3/push_subscriptions/${subscriptionId}`,
            {
                params: {
                    client_id: clientId,
                    client_secret: clientSecret
                }
            }
        );

        console.log(`✅ Webhook subscription ${subscriptionId} deleted successfully`);
    } catch (error: any) {
        console.error("\n❌ Failed to delete webhook:");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.error(error.message);
        }
        throw error;
    }
}

// CLI interface
const command = process.argv[2];

(async () => {
    try {
        console.log("\n🔧 Strava Webhook Manager\n");

        switch (command) {
            case 'register':
                await registerWebhook();
                break;
            case 'list':
                await listWebhooks();
                break;
            case 'delete':
                const subscriptionId = parseInt(process.argv[3]);
                if (!subscriptionId || isNaN(subscriptionId)) {
                    throw new Error("Subscription ID required for delete command");
                }
                await deleteWebhook(subscriptionId);
                break;
            default:
                console.log("Usage:");
                console.log("  npm run registerWebhook register     - Register new webhook subscription");
                console.log("  npm run registerWebhook list         - List active webhook subscriptions");
                console.log("  npm run registerWebhook delete <id>  - Delete webhook subscription by ID");
                console.log("\nRequired environment variables (.env file):");
                console.log("  STRAVA_CLIENT_ID");
                console.log("  STRAVA_CLIENT_SECRET");
                console.log("  STRAVA_WEBHOOK_VERIFY_TOKEN");
                console.log("  WEBHOOK_CALLBACK_URL (optional, defaults to https://webhooks.ploufbag.com)");
                process.exit(1);
        }
    } catch (error) {
        console.error("\n💥 Error:", error);
        process.exit(1);
    }
})();
