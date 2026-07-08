'use client';

import { Turnstile as TurnstileWidget, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

// Bounded auto-recovery: a transient script-load / network failure must never
// leave the widget permanently blank (which silently blocks the form).
const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

interface TurnstileProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  className?: string;
}

export function TurnstileBox({ onVerify, onError, className }: TurnstileProps) {
  // Read inside the component so it stays inlined by Next.js AND unit-testable.
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const ref = useRef<TurnstileInstance | null>(null);
  const retriesRef = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const t = useTranslations('captcha');

  const remount = useCallback(() => {
    setStatus('loading');
    setReloadKey((k) => k + 1);
  }, []);

  // Called on widget error, timeout, or — crucially — script-load failure,
  // which the previous implementation ignored (ref was null so reset() was a
  // no-op and the widget stayed blank forever).
  const handleFailure = useCallback(() => {
    onError?.();
    if (retriesRef.current < MAX_AUTO_RETRIES) {
      retriesRef.current += 1;
      window.setTimeout(remount, RETRY_DELAY_MS);
    } else {
      setStatus('error');
    }
  }, [onError, remount]);

  const handleSuccess = useCallback(
    (token: string) => {
      retriesRef.current = 0;
      setStatus('ready');
      onVerify(token);
    },
    [onVerify]
  );

  const handleManualRetry = useCallback(() => {
    retriesRef.current = 0;
    remount();
  }, [remount]);

  if (!siteKey) return null; // Graceful: no Turnstile in dev without a key.

  if (status === 'error') {
    return (
      <div className={className} role="alert" style={{ minHeight: 65 }}>
        <p className="text-sm text-destructive">{t('failed')}</p>
        <button
          type="button"
          onClick={handleManualRetry}
          className="mt-1 text-sm font-medium text-primary underline underline-offset-2"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    // Reserve height so the widget cannot collapse to zero and the layout does
    // not shift when it finally renders.
    <div className={className} style={{ minHeight: 65 }}>
      {status === 'loading' && <p className="mb-1 text-xs text-muted-foreground">{t('loading')}</p>}
      <TurnstileWidget
        key={reloadKey}
        ref={ref}
        siteKey={siteKey}
        onSuccess={handleSuccess}
        onWidgetLoad={() => setStatus('ready')}
        onError={handleFailure}
        onExpire={() => {
          onVerify(''); // drop the stale token so it is never submitted
          ref.current?.reset();
        }}
        onTimeout={handleFailure}
        onUnsupported={() => setStatus('error')}
        options={{
          theme: 'auto',
          // "normal" (300x65) renders reliably; "flexible" can collapse to a
          // zero-size (invisible) widget inside a constrained container.
          size: 'normal',
          retry: 'auto',
          refreshExpired: 'auto',
        }}
        scriptOptions={{ onError: handleFailure }}
      />
    </div>
  );
}
