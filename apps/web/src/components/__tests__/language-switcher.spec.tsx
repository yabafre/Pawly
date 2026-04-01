import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageSwitcher } from '../language-switcher';

// Mock router.replace for locale switching
const mockReplace = vi.fn();

// Override the default mock for this test file
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/dashboard',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'fr': 'Francais',
      'en': 'English',
      'switchTo': 'Switch language',
    };
    return translations[key] || key;
  },
  useLocale: () => 'fr',
}));

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['fr', 'en'],
    defaultLocale: 'fr',
  },
}));

vi.mock('@/lib/pwa-utils', () => ({
  isStandalone: vi.fn(() => false),
}));

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with current locale displayed', () => {
    render(<LanguageSwitcher />);

    // The select trigger should be visible
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-label', 'Switch language');
  });

  it('displays the Globe icon', () => {
    render(<LanguageSwitcher />);

    // Check for the globe icon (by its class or svg element)
    const trigger = screen.getByRole('combobox');
    const svg = trigger.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('shows language options when clicked', async () => {
    render(<LanguageSwitcher />);

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    // Options should appear
    const frOption = await screen.findByRole('option', { name: /francais/i });
    const enOption = await screen.findByRole('option', { name: /english/i });

    expect(frOption).toBeInTheDocument();
    expect(enOption).toBeInTheDocument();
  });

  it('calls router.replace when locale is changed', async () => {
    render(<LanguageSwitcher />);

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    const enOption = await screen.findByRole('option', { name: /english/i });
    fireEvent.click(enOption);

    // router.replace should be called with new locale
    // Note: Due to React's startTransition, this may be wrapped
    expect(mockReplace).toHaveBeenCalledWith(
      '/admin/dashboard',
      { locale: 'en' }
    );
  });

  it('has accessible trigger with aria-label', () => {
    render(<LanguageSwitcher />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-label', 'Switch language');
  });

  it('uses window.location.replace in PWA standalone mode', async () => {
    const { isStandalone } = await import('@/lib/pwa-utils');
    vi.mocked(isStandalone).mockReturnValue(true);

    const mockLocationReplace = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, pathname: '/fr/dashboard/settings', replace: mockLocationReplace },
      writable: true,
    });

    render(<LanguageSwitcher />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    const enOption = await screen.findByRole('option', { name: /english/i });
    fireEvent.click(enOption);

    expect(mockLocationReplace).toHaveBeenCalledWith('/en/dashboard/settings');
    expect(mockReplace).not.toHaveBeenCalled();

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });
});
