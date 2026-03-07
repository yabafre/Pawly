import { registerOTel } from '@vercel/otel';

export function register() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || 'pawly-web',
  });
}
