import webPush from 'web-push';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
const vapidConfigured =
  !!VAPID_PUBLIC_KEY && !!VAPID_PRIVATE_KEY && !!VAPID_SUBJECT;

if (vapidConfigured) {
  webPush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

export { webPush, vapidConfigured };
