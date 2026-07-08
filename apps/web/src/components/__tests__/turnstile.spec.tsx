import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture the latest props the Turnstile widget is rendered with so the test
// can drive its callbacks (success / error / script-load failure).
let lastWidgetProps: Record<string, any> | null = null;

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: (props: Record<string, any>) => {
    lastWidgetProps = props;
    return <div data-testid="turnstile-widget" />;
  },
}));

// next-intl is globally mocked in vitest.setup.ts: useTranslations returns (key) => key.

import { TurnstileBox } from '../turnstile';

describe('TurnstileBox', () => {
  beforeEach(() => {
    lastWidgetProps = null;
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('renders null when the site key is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    const { container } = render(<TurnstileBox onVerify={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls onVerify with the token on success', () => {
    const onVerify = vi.fn();
    render(<TurnstileBox onVerify={onVerify} />);
    act(() => lastWidgetProps!.onSuccess('tok-123'));
    expect(onVerify).toHaveBeenCalledWith('tok-123');
  });

  it('wires scriptOptions.onError so a script-load failure is caught', () => {
    render(<TurnstileBox onVerify={vi.fn()} />);
    expect(typeof lastWidgetProps!.scriptOptions?.onError).toBe('function');
  });

  it('shows a fallback with a retry button after auto-retries are exhausted', () => {
    vi.useFakeTimers();
    render(<TurnstileBox onVerify={vi.fn()} onError={vi.fn()} />);
    // 3 auto-retries, then the 4th failure surfaces the error fallback.
    for (let i = 0; i < 4; i++) {
      act(() => lastWidgetProps!.onError());
      act(() => vi.advanceTimersByTime(2000));
    }
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('retry')).toBeInTheDocument();
    expect(screen.queryByTestId('turnstile-widget')).not.toBeInTheDocument();
  });

  it('re-mounts the widget when the manual retry button is clicked', () => {
    vi.useFakeTimers();
    render(<TurnstileBox onVerify={vi.fn()} />);
    for (let i = 0; i < 4; i++) {
      act(() => lastWidgetProps!.onError());
      act(() => vi.advanceTimersByTime(2000));
    }
    expect(screen.queryByTestId('turnstile-widget')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('retry'));
    expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
  });

  it('clears the parent token when the challenge expires', () => {
    const onVerify = vi.fn();
    render(<TurnstileBox onVerify={onVerify} />);
    act(() => lastWidgetProps!.onSuccess('tok-123'));
    expect(onVerify).toHaveBeenLastCalledWith('tok-123');
    act(() => lastWidgetProps!.onExpire());
    expect(onVerify).toHaveBeenLastCalledWith('');
  });

  it('passes retry and refreshExpired auto options to the widget', () => {
    render(<TurnstileBox onVerify={vi.fn()} />);
    expect(lastWidgetProps!.options).toMatchObject({
      retry: 'auto',
      refreshExpired: 'auto',
    });
  });
});
