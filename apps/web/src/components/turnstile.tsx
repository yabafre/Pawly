"use client";

import { Turnstile as TurnstileWidget, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef, useCallback } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface TurnstileProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  className?: string;
}

export function TurnstileBox({ onVerify, onError, className }: TurnstileProps) {
  const ref = useRef<TurnstileInstance>(null);

  const handleError = useCallback(() => {
    ref.current?.reset();
    onError?.();
  }, [onError]);

  if (!SITE_KEY) return null; // Graceful: no Turnstile in dev without key

  return (
    <TurnstileWidget
      ref={ref}
      siteKey={SITE_KEY}
      onSuccess={onVerify}
      onError={handleError}
      onExpire={handleError}
      options={{ theme: "auto", size: "flexible" }}
      className={className}
    />
  );
}
