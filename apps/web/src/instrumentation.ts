import { registerOTel } from '@vercel/otel';

export function register() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  // Override OTEL_SERVICE_NAME for the web process — the shared .env sets it
  // to 'pawly-api' which the OTel SDK reads before @vercel/otel can apply
  // the programmatic serviceName config.
  const webServiceName = process.env.OTEL_SERVICE_NAME_FRONT || 'pawly-web';
  process.env.OTEL_SERVICE_NAME = webServiceName;

  registerOTel({
    serviceName: webServiceName,
  });
}
