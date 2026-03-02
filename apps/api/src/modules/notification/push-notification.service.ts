import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PrismaService } from '@/prisma/prisma.service';
import type { EnvConfig } from '@/config/index';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private isConfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {
    const publicKey = this.configService.get('VAPID_PUBLIC_KEY', { infer: true });
    const privateKey = this.configService.get('VAPID_PRIVATE_KEY', { infer: true });
    const subject = this.configService.get('VAPID_SUBJECT', { infer: true });

    if (publicKey && privateKey && subject) {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.isConfigured = true;
      this.logger.log('Web Push configured with VAPID keys');
    } else {
      this.logger.warn('VAPID keys not configured — push notifications disabled');
    }
  }

  async subscribe(
    employeeId: string,
    clinicId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        employeeId,
        clinicId,
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        employeeId,
        clinicId,
      },
    });
  }

  async unsubscribe(endpoint: string, employeeId: string) {
    return this.prisma.pushSubscription.deleteMany({
      where: { endpoint, employeeId },
    });
  }

  async getSubscription(employeeId: string) {
    return this.prisma.pushSubscription.findFirst({
      where: { employeeId },
      select: { endpoint: true, createdAt: true },
    });
  }

  async sendPushNotification(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: { title: string; body: string; url?: string },
  ): Promise<boolean> {
    if (!this.isConfigured) return false;

    const pushSub: webPush.PushSubscription = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    };

    try {
      await webPush.sendNotification(pushSub, JSON.stringify(payload));
      return true;
    } catch (err: unknown) {
      const error = err as { statusCode?: number };
      if (error.statusCode === 410 || error.statusCode === 404) {
        this.logger.warn(`Stale subscription removed: ${subscription.endpoint.slice(0, 60)}…`);
        await this.prisma.pushSubscription.deleteMany({
          where: { endpoint: subscription.endpoint },
        });
      } else {
        this.logger.error(`Push failed: ${(err as Error).message}`);
      }
      return false;
    }
  }

  async sendBatchPushNotifications(
    employeeIds: string[],
    payload: { title: string; body: string; url?: string },
  ): Promise<number> {
    if (!this.isConfigured || employeeIds.length === 0) return 0;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { employeeId: { in: employeeIds } },
    });

    if (subscriptions.length === 0) return 0;

    let successCount = 0;
    const results = await Promise.allSettled(
      subscriptions.map((sub) => this.sendPushNotification(sub, payload)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        successCount++;
      }
    }

    this.logger.log(`Push batch: ${successCount}/${subscriptions.length} sent`);
    return successCount;
  }
}
