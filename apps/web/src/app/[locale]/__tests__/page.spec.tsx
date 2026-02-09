import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/font/google (not available in test environment)
vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: '--font-inter' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}));

// Mock the child components to isolate page-level testing
vi.mock('../_components/LandingHeader', () => ({
  LandingHeader: () => <div data-testid="landing-header">Header</div>,
}));
vi.mock('../_components/HeroSection', () => ({
  HeroSection: () => <div data-testid="hero-section">Hero</div>,
}));
vi.mock('../_components/FeaturesSection', () => ({
  FeaturesSection: () => <div data-testid="features-section">Features</div>,
}));
vi.mock('../_components/PricingPreviewSection', () => ({
  PricingPreviewSection: () => <div data-testid="pricing-section">Pricing</div>,
}));
vi.mock('../_components/TestimonialsSection', () => ({
  TestimonialsSection: () => <div data-testid="testimonials-section">Testimonials</div>,
}));
vi.mock('../_components/CTASection', () => ({
  CTASection: () => <div data-testid="cta-section">CTA</div>,
}));
vi.mock('../_components/LandingFooter', () => ({
  LandingFooter: () => <div data-testid="landing-footer">Footer</div>,
}));

describe('LandingPage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('generateMetadata', () => {
    it('returns correct metadata for fr locale', async () => {
      const { generateMetadata } = await import('../page');
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale: 'fr' }),
      });

      expect(metadata.title).toBe('meta.title');
      expect(metadata.description).toBe('meta.description');
      expect(metadata.openGraph?.locale).toBe('fr_FR');
      expect(metadata.openGraph?.siteName).toBe('Pawly');
      expect(metadata.openGraph?.type).toBe('website');
      expect(metadata.alternates?.languages).toEqual({
        fr: expect.any(String),
        en: expect.any(String),
      });
    });

    it('returns correct metadata for en locale', async () => {
      const { generateMetadata } = await import('../page');
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale: 'en' }),
      });

      expect(metadata.openGraph?.locale).toBe('en_US');
      expect(metadata.openGraph?.url).toContain('/en');
      expect(metadata.alternates?.canonical).toContain('/en');
    });

    it('includes openGraph images as empty array (no OG image file yet)', async () => {
      const { generateMetadata } = await import('../page');
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale: 'fr' }),
      });

      const ogImages = metadata.openGraph?.images;
      expect(ogImages).toBeDefined();
      expect(Array.isArray(ogImages)).toBe(true);
      expect(ogImages).toHaveLength(0);
    });

    it('includes twitter card metadata', async () => {
      const { generateMetadata } = await import('../page');
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale: 'fr' }),
      });

      expect(metadata.twitter?.card).toBe('summary_large_image');
      expect(metadata.twitter?.images).toBeDefined();
      expect(metadata.twitter?.images).toHaveLength(0);
    });

    it('sets canonical URL correctly per locale', async () => {
      const { generateMetadata } = await import('../page');

      const frMetadata = await generateMetadata({
        params: Promise.resolve({ locale: 'fr' }),
      });
      expect(frMetadata.alternates?.canonical).not.toContain('/en');

      const enMetadata = await generateMetadata({
        params: Promise.resolve({ locale: 'en' }),
      });
      expect(enMetadata.alternates?.canonical).toContain('/en');
    });
  });

  describe('LandingPage component', () => {
    it('renders all landing page sections', async () => {
      const { default: LandingPage } = await import('../page');
      const element = await LandingPage({
        params: Promise.resolve({ locale: 'fr' }),
      });
      render(element);

      expect(screen.getByTestId('landing-header')).toBeInTheDocument();
      expect(screen.getByTestId('hero-section')).toBeInTheDocument();
      expect(screen.getByTestId('features-section')).toBeInTheDocument();
      expect(screen.getByTestId('pricing-section')).toBeInTheDocument();
      expect(screen.getByTestId('testimonials-section')).toBeInTheDocument();
      expect(screen.getByTestId('cta-section')).toBeInTheDocument();
      expect(screen.getByTestId('landing-footer')).toBeInTheDocument();
    });

    it('renders main content area with id', async () => {
      const { default: LandingPage } = await import('../page');
      const element = await LandingPage({
        params: Promise.resolve({ locale: 'fr' }),
      });
      const { container } = render(element);

      const main = container.querySelector('#main-content');
      expect(main).toBeInTheDocument();
      expect(main?.tagName).toBe('MAIN');
    });

    it('renders JSON-LD structured data script', async () => {
      const { default: LandingPage } = await import('../page');
      const element = await LandingPage({
        params: Promise.resolve({ locale: 'fr' }),
      });
      const { container } = render(element);

      const script = container.querySelector('script[type="application/ld+json"]');
      expect(script).toBeInTheDocument();

      const jsonLd = JSON.parse(script!.innerHTML);
      expect(jsonLd['@context']).toBe('https://schema.org');
      expect(jsonLd['@type']).toBe('SoftwareApplication');
      expect(jsonLd.name).toBe('Pawly');
      expect(jsonLd.applicationCategory).toBe('BusinessApplication');
    });

    it('JSON-LD contains valid pricing offers', async () => {
      const { default: LandingPage } = await import('../page');
      const element = await LandingPage({
        params: Promise.resolve({ locale: 'fr' }),
      });
      const { container } = render(element);

      const script = container.querySelector('script[type="application/ld+json"]');
      const jsonLd = JSON.parse(script!.innerHTML);

      expect(jsonLd.offers['@type']).toBe('AggregateOffer');
      expect(jsonLd.offers.priceCurrency).toBe('EUR');
      expect(Number(jsonLd.offers.lowPrice)).toBeGreaterThan(0);
      expect(Number(jsonLd.offers.highPrice)).toBeGreaterThan(
        Number(jsonLd.offers.lowPrice)
      );
    });

    it('calls setRequestLocale with the locale', async () => {
      const { setRequestLocale } = await import('next-intl/server');
      const { default: LandingPage } = await import('../page');

      await LandingPage({
        params: Promise.resolve({ locale: 'fr' }),
      });

      expect(setRequestLocale).toHaveBeenCalledWith('fr');
    });
  });

  describe('generateStaticParams (from layout)', () => {
    it('generates params for all supported locales', async () => {
      const { generateStaticParams } = await import('../layout');
      const params = generateStaticParams();

      expect(params).toEqual(
        expect.arrayContaining([{ locale: 'fr' }, { locale: 'en' }])
      );
      expect(params).toHaveLength(2);
    });
  });
});
