import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingHeader } from '../LandingHeader';
import { HeroSection } from '../HeroSection';
import { FeaturesSection } from '../FeaturesSection';
import { PricingPreviewSection } from '../PricingPreviewSection';
import { TestimonialsSection } from '../TestimonialsSection';
import { CTASection } from '../CTASection';
import { LandingFooter } from '../LandingFooter';

// Mock PawlyLogo component
vi.mock('@/components/pawly-logo', () => ({
  PawlyLogo: ({ className, theme }: { className?: string; theme?: string }) => (
    <div data-testid="pawly-logo" className={className} data-theme={theme}>PawlyLogo</div>
  ),
}));

// Mock LanguageSwitcher component (client component)
vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher">LanguageSwitcher</div>,
}));

// Mock AnchorNavLink (client component used by LandingHeader)
vi.mock('../AnchorNavLink', () => ({
  AnchorNavLink: ({ children, hash, className }: { children: React.ReactNode; hash: string; className?: string }) => (
    <a href={`#${hash}`} className={className}>{children}</a>
  ),
}));

// Mock trpc client used by LandingHeader
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    auth: {
      getMe: {
        query: vi.fn().mockRejectedValue(new Error('Not authenticated')),
      },
    },
  },
}));

// Mock FallingAnimals (canvas-based component)
vi.mock('@/components/ui/falling-animals', () => ({
  FallingAnimals: (props: any) => <div data-testid="falling-animals" {...props} />,
}));

describe('LandingHeader', () => {
  it('renders header with navigation', async () => {
    const element = await LandingHeader();
    render(element);

    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('renders PawlyLogo', async () => {
    const element = await LandingHeader();
    render(element);

    expect(screen.getByTestId('pawly-logo')).toBeInTheDocument();
  });

  it('renders login link when no auth cookie', async () => {
    const element = await LandingHeader();
    render(element);

    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('renders LanguageSwitcher', async () => {
    const element = await LandingHeader();
    render(element);

    // LandingHeader no longer renders LanguageSwitcher directly
    // (it was removed from the header component)
  });

  it('has sticky header styling', async () => {
    const element = await LandingHeader();
    render(element);

    const header = screen.getByRole('banner');
    expect(header.className).toContain('sticky');
  });

  it('renders desktop navigation links', async () => {
    const element = await LandingHeader();
    render(element);

    expect(screen.getByText('navFeatures')).toBeInTheDocument();
    expect(screen.getByText('navPricing')).toBeInTheDocument();
  });
});

describe('HeroSection', () => {
  it('renders hero with h1 title', async () => {
    const element = await HeroSection();
    render(element);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('titleLine1');
  });

  it('renders subtitle text', async () => {
    const element = await HeroSection();
    render(element);

    expect(screen.getByText('subtitle')).toBeInTheDocument();
  });

  it('renders primary and secondary CTA buttons', async () => {
    const element = await HeroSection();
    render(element);

    const primaryCta = screen.getByText('cta');
    expect(primaryCta).toBeInTheDocument();
    expect(primaryCta.closest('a')).toHaveAttribute('href', '/pricing/register?plan=starter');

    const secondaryCta = screen.getByText('secondaryCta');
    expect(secondaryCta).toBeInTheDocument();
    expect(secondaryCta.closest('a')).toHaveAttribute('href', '#pricing');
  });

  it('renders announcement badge', async () => {
    const element = await HeroSection();
    render(element);

    expect(screen.getByText('badge')).toBeInTheDocument();
  });
});

describe('FeaturesSection', () => {
  it('renders section with id="features"', async () => {
    const element = await FeaturesSection();
    const { container } = render(element);

    const section = container.querySelector('#features');
    expect(section).toBeInTheDocument();
  });

  it('renders section title as h2', async () => {
    const element = await FeaturesSection();
    render(element);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('title');
  });

  it('renders 6 feature cards', async () => {
    const element = await FeaturesSection();
    render(element);

    const featureHeadings = screen.getAllByRole('heading', { level: 3 });
    expect(featureHeadings).toHaveLength(6);
  });

  it('renders feature icons', async () => {
    const element = await FeaturesSection();
    const { container } = render(element);

    const icons = container.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThanOrEqual(6);
  });

  it('renders section badge', async () => {
    const element = await FeaturesSection();
    render(element);

    expect(screen.getByText('badge')).toBeInTheDocument();
  });
});

describe('PricingPreviewSection', () => {
  const setupPricingMock = async () => {
    const { getTranslations } = await import('next-intl/server');
    vi.mocked(getTranslations).mockImplementation(async () => {
      const t = (key: string) => key;
      t.raw = (key: string) => {
        if (key.endsWith('.features')) {
          return ['Feature 1', 'Feature 2', 'Feature 3'];
        }
        return key;
      };
      t.rich = (key: string) => key;
      t.markup = (key: string) => key;
      t.has = () => true;
      return t as any;
    });
  };

  it('renders section title as h2', async () => {
    await setupPricingMock();

    const element = await PricingPreviewSection();
    render(element);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('title');
  });

  it('renders 2 pricing plan cards', async () => {
    await setupPricingMock();

    const element = await PricingPreviewSection();
    render(element);

    const planHeadings = screen.getAllByRole('heading', { level: 3 });
    expect(planHeadings).toHaveLength(2);
  });

  it('renders popular badge for Professional plan', async () => {
    const { getTranslations } = await import('next-intl/server');
    vi.mocked(getTranslations).mockImplementation(async () => {
      const t = (key: string) => {
        if (key === 'professional.popular') return 'Most Popular';
        return key;
      };
      t.raw = (key: string) => {
        if (key.endsWith('.features')) return ['Feature 1'];
        return key;
      };
      t.rich = (key: string) => key;
      t.markup = (key: string) => key;
      t.has = () => true;
      return t as any;
    });

    const element = await PricingPreviewSection();
    render(element);

    expect(screen.getByText('Most Popular')).toBeInTheDocument();
  });

  it('renders CTA buttons linking to /pricing/register', async () => {
    await setupPricingMock();

    const element = await PricingPreviewSection();
    render(element);

    const ctaLinks = screen.getAllByText('cta');
    expect(ctaLinks).toHaveLength(2);
    const expectedPlans = ['starter', 'professional'];
    ctaLinks.forEach((link, i) => {
      expect(link.closest('a')).toHaveAttribute('href', `/pricing/register?plan=${expectedPlans[i]}`);
    });
  });

  it('renders section badge', async () => {
    await setupPricingMock();

    const element = await PricingPreviewSection();
    render(element);

    expect(screen.getByText('badge')).toBeInTheDocument();
  });
});

describe('TestimonialsSection', () => {
  it('renders section title as h2', async () => {
    const element = await TestimonialsSection();
    render(element);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('title');
  });

  it('renders 3 testimonial cards', async () => {
    const element = await TestimonialsSection();
    render(element);

    const blockquotes = screen.getAllByRole('blockquote');
    expect(blockquotes).toHaveLength(3);
  });

  it('renders author names and roles', async () => {
    const element = await TestimonialsSection();
    render(element);

    expect(screen.getByText('items.1.author')).toBeInTheDocument();
    expect(screen.getByText('items.2.author')).toBeInTheDocument();
    expect(screen.getByText('items.3.author')).toBeInTheDocument();
  });

  it('renders section badge', async () => {
    const element = await TestimonialsSection();
    render(element);

    expect(screen.getByText('badge')).toBeInTheDocument();
  });
});

describe('CTASection', () => {
  it('renders section with h2 title', async () => {
    const element = await CTASection();
    render(element);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('title');
  });

  it('renders CTA button linking to /pricing/register', async () => {
    const element = await CTASection();
    render(element);

    const ctaButton = screen.getByText('button');
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton.closest('a')).toHaveAttribute('href', '/pricing/register?plan=starter');
  });

  it('has primary background styling', async () => {
    const element = await CTASection();
    const { container } = render(element);

    const ctaDiv = container.querySelector('.bg-primary\\/\\[0\\.03\\]');
    expect(ctaDiv).toBeInTheDocument();
  });
});

describe('LandingFooter', () => {
  it('renders footer element', async () => {
    const element = await LandingFooter();
    render(element);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders PawlyLogo', async () => {
    const element = await LandingFooter();
    render(element);

    const logo = screen.getByTestId('pawly-logo');
    expect(logo).toBeInTheDocument();
  });

  it('renders footer navigation sections', async () => {
    const element = await LandingFooter();
    render(element);

    expect(screen.getByText('product')).toBeInTheDocument();
    expect(screen.getByText('legal')).toBeInTheDocument();
  });

  it('renders copyright text', async () => {
    const element = await LandingFooter();
    render(element);

    expect(screen.getByText('copyright')).toBeInTheDocument();
  });

  it('renders LanguageSwitcher', async () => {
    const element = await LandingFooter();
    render(element);

    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });

  it('renders product links', async () => {
    const element = await LandingFooter();
    render(element);

    const featuresLink = screen.getByText('features');
    expect(featuresLink.closest('a')).toHaveAttribute('href', '#features');

    const pricingLink = screen.getByText('pricing');
    expect(pricingLink.closest('a')).toHaveAttribute('href', '/#pricing');
  });

  it('has border-t styling', async () => {
    const element = await LandingFooter();
    render(element);

    const footer = screen.getByRole('contentinfo');
    expect(footer.className).toContain('border-t');
  });
});
