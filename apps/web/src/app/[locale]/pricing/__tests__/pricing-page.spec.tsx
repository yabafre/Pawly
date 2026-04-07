import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock child components to isolate page-level testing
vi.mock('../_components/PricingCheckout', () => ({
  PricingCheckout: () => <div data-testid="pricing-checkout">PricingCheckout</div>,
}));
vi.mock('../../_components/LandingHeader', () => ({
  LandingHeader: () => <div data-testid="landing-header">Header</div>,
}));
vi.mock('../../_components/LandingFooter', () => ({
  LandingFooter: () => <div data-testid="landing-footer">Footer</div>,
}));

describe('PricingPage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('generateMetadata', () => {
    it('returns correct metadata for fr locale', async () => {
      const { generateMetadata } = await import('../page');
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale: 'fr' }),
      });

      expect(metadata.title).toBe('title');
      expect(metadata.description).toBe('description');
      expect(metadata.openGraph?.title).toBe('title');
      expect(metadata.openGraph?.description).toBe('description');
      const openGraph = metadata.openGraph;
      expect(openGraph && 'type' in openGraph ? openGraph.type : undefined).toBe('website');
    });

    it('returns correct metadata for en locale', async () => {
      const { generateMetadata } = await import('../page');
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale: 'en' }),
      });

      expect(metadata.title).toBe('title');
      expect(metadata.description).toBe('description');
    });

    it('includes twitter card metadata', async () => {
      const { generateMetadata } = await import('../page');
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale: 'fr' }),
      });

      const twitter = metadata.twitter;
      expect(twitter && 'card' in twitter ? twitter.card : undefined).toBe('summary_large_image');
      expect(metadata.twitter?.title).toBe('title');
      expect(metadata.twitter?.description).toBe('description');
    });
  });

  describe('page rendering', () => {
    it('renders the page with header, checkout, and footer', async () => {
      const { default: PricingPage } = await import('../page');
      const el = await PricingPage({ params: Promise.resolve({ locale: 'fr' }) });
      render(el);

      expect(screen.getByTestId('landing-header')).toBeInTheDocument();
      expect(screen.getByTestId('pricing-checkout')).toBeInTheDocument();
      expect(screen.getByTestId('landing-footer')).toBeInTheDocument();
    });

    it('renders heading and subtitle from translations', async () => {
      const { default: PricingPage } = await import('../page');
      const el = await PricingPage({ params: Promise.resolve({ locale: 'fr' }) });
      render(el);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('heading');
      expect(screen.getByText('subtitle')).toBeInTheDocument();
    });

    it('has correct main element with id for skip link', async () => {
      const { default: PricingPage } = await import('../page');
      const el = await PricingPage({ params: Promise.resolve({ locale: 'fr' }) });
      render(el);

      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    });

    it('calls setRequestLocale with the correct locale', async () => {
      const { setRequestLocale } = await import('next-intl/server');
      const { default: PricingPage } = await import('../page');
      await PricingPage({ params: Promise.resolve({ locale: 'en' }) });

      expect(setRequestLocale).toHaveBeenCalledWith('en');
    });
  });
});
