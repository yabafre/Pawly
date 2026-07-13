import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useHydrated } from '../useHydrated';

function Probe() {
  return <span>{useHydrated() ? 'hydrated' : 'server'}</span>;
}

describe('useHydrated', () => {
  it('returns false during server rendering', () => {
    // renderToString uses the server snapshot — this is what the SSR pass
    // (and therefore the first hydration render) must see.
    expect(renderToString(<Probe />)).toContain('server');
  });

  it('returns true after client render', () => {
    const { result } = renderHook(() => useHydrated());
    expect(result.current).toBe(true);
  });

  it('stays true across re-renders', () => {
    const { result, rerender } = renderHook(() => useHydrated());
    rerender();
    expect(result.current).toBe(true);
  });
});
