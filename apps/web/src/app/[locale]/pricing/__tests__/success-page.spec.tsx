import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';

describe('CheckoutSuccessPage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('redirects to pricing page with correct locale', async () => {
    const { default: SuccessPage } = await import('../success/page');

    await expect(
      SuccessPage({ params: Promise.resolve({ locale: 'fr' }) })
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith('/fr/pricing');
  });

  it('redirects to pricing page with en locale', async () => {
    const { default: SuccessPage } = await import('../success/page');

    await expect(
      SuccessPage({ params: Promise.resolve({ locale: 'en' }) })
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith('/en/pricing');
  });
});
