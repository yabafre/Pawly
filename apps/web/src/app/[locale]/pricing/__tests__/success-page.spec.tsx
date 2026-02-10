import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock child components
vi.mock('../../_components/LandingHeader', () => ({
  LandingHeader: () => <div data-testid="landing-header">Header</div>,
}));
vi.mock('../../_components/LandingFooter', () => ({
  LandingFooter: () => <div data-testid="landing-footer">Footer</div>,
}));

describe('CheckoutSuccessPage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('generateMetadata', () => {
    it('returns correct metadata with noindex', async () => {
      const { generateMetadata } = await import('../success/page');
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale: 'fr' }),
      });

      expect(metadata.title).toBe('title');
      expect(metadata.robots).toEqual({ index: false, follow: false });
    });
  });

  describe('page rendering', () => {
    it('renders success page with header and footer', async () => {
      const { default: SuccessPage } = await import('../success/page');
      const el = await SuccessPage({ params: Promise.resolve({ locale: 'fr' }) });
      render(el);

      expect(screen.getByTestId('landing-header')).toBeInTheDocument();
      expect(screen.getByTestId('landing-footer')).toBeInTheDocument();
    });

    it('renders success title and description', async () => {
      const { default: SuccessPage } = await import('../success/page');
      const el = await SuccessPage({ params: Promise.resolve({ locale: 'fr' }) });
      render(el);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('title');
      expect(screen.getByText('description')).toBeInTheDocument();
    });

    it('renders check email section', async () => {
      const { default: SuccessPage } = await import('../success/page');
      const el = await SuccessPage({ params: Promise.resolve({ locale: 'fr' }) });
      render(el);

      expect(screen.getByText('checkEmail')).toBeInTheDocument();
      expect(screen.getByText('checkEmailDescription')).toBeInTheDocument();
    });

    it('renders spam note', async () => {
      const { default: SuccessPage } = await import('../success/page');
      const el = await SuccessPage({ params: Promise.resolve({ locale: 'fr' }) });
      render(el);

      expect(screen.getByText('spamNote')).toBeInTheDocument();
    });

    it('renders homepage link', async () => {
      const { default: SuccessPage } = await import('../success/page');
      const el = await SuccessPage({ params: Promise.resolve({ locale: 'fr' }) });
      render(el);

      const link = screen.getByRole('link', { name: 'backToHome' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/');
    });

    it('calls setRequestLocale with the correct locale', async () => {
      const { setRequestLocale } = await import('next-intl/server');
      const { default: SuccessPage } = await import('../success/page');
      await SuccessPage({ params: Promise.resolve({ locale: 'en' }) });

      expect(setRequestLocale).toHaveBeenCalledWith('en');
    });

    it('has correct main element with id for skip link', async () => {
      const { default: SuccessPage } = await import('../success/page');
      const el = await SuccessPage({ params: Promise.resolve({ locale: 'fr' }) });
      render(el);

      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    });
  });
});
