import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('pawly-api');

// --- Planning ---
export const planningGenerationDuration = meter.createHistogram(
  'pawly.planning.generation.duration',
  {
    description: 'Duration of monthly planning generation in milliseconds',
    unit: 'ms',
  },
);

// --- Email ---
export const emailSendCounter = meter.createCounter('pawly.email.send', {
  description: 'Emails sent (attributes: type, outcome)',
});

export const emailBatchSize = meter.createHistogram(
  'pawly.email.batch.size',
  {
    description: 'Number of emails per batch send',
    unit: '{emails}',
  },
);

// --- Push Notifications ---
export const pushSendCounter = meter.createCounter('pawly.push.send', {
  description: 'Push notifications sent (attributes: outcome)',
});

// --- Stripe ---
export const stripeWebhookDuration = meter.createHistogram(
  'pawly.stripe.webhook.duration',
  {
    description: 'Stripe webhook processing duration in milliseconds',
    unit: 'ms',
  },
);

export const stripeWebhookCounter = meter.createCounter(
  'pawly.stripe.webhook',
  {
    description: 'Stripe webhook events processed (attributes: event_type, outcome)',
  },
);

// --- Auth ---
export const authRequestCounter = meter.createCounter('pawly.auth.request', {
  description: 'Auth requests (attributes: method, outcome)',
});

// --- Rate Limiting ---
export const rateLimitHitCounter = meter.createCounter(
  'pawly.rate_limit.hit',
  {
    description: 'Rate limit rejections (attributes: endpoint)',
  },
);
