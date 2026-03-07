import { task, logger } from '@trigger.dev/sdk';
import { getPrisma } from '../lib/prisma';
import { webPush, vapidConfigured } from '../lib/web-push';

interface BatchPushPayload {
  employeeIds: string[];
  title: string;
  body: string;
  url?: string;
}

export const batchPushPublishTask = task({
  id: 'batch-push-publish',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 5000,
    factor: 2,
  },
  run: async (payload: BatchPushPayload) => {
    const { employeeIds, title, body, url } = payload;

    if (employeeIds.length === 0) {
      logger.info('No employee IDs provided');
      return { sent: 0 };
    }

    if (!vapidConfigured) {
      logger.warn('VAPID keys not configured — skipping push notifications');
      return { sent: 0 };
    }

    const subscriptions = await getPrisma().pushSubscription.findMany({
      where: { employeeId: { in: employeeIds } },
    });

    if (subscriptions.length === 0) {
      logger.info('No push subscriptions found');
      return { sent: 0 };
    }

    const notificationPayload = JSON.stringify({ title, body, url });
    let successCount = 0;

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            notificationPayload,
          );
          return true;
        } catch (err: unknown) {
          const error = err as { statusCode?: number };
          if (error.statusCode === 410 || error.statusCode === 404) {
            logger.warn(`Stale subscription removed`, { endpoint: sub.endpoint.slice(0, 60) });
            await getPrisma().pushSubscription.deleteMany({
              where: { endpoint: sub.endpoint },
            });
          } else {
            logger.error(`Push failed`, { error: String(err) });
          }
          return false;
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        successCount++;
      }
    }

    logger.info(`Batch push complete`, { successCount, total: subscriptions.length });
    return { sent: successCount };
  },
});
