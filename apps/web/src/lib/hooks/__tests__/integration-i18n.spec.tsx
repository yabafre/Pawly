import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Configurable locale for tests — default FR, switchable to EN
const state = vi.hoisted(() => ({
  currentLocale: 'fr' as string,
}));

// Translation dictionaries mirroring actual translation files
const translations: Record<string, Record<string, string>> = {
  fr: {
    'common.logout': 'Déconnexion',
    'common.loading': 'Chargement...',
    'common.language.label': 'Langue',
    'dashboard.greeting': 'Bonjour,',
    'dashboard.thisWeek': 'Cette semaine',
    'dashboard.targetReached': 'Objectif atteint',
    'dashboard.today': "Aujourd'hui",
  },
  en: {
    'common.logout': 'Log out',
    'common.loading': 'Loading...',
    'common.language.label': 'Language',
    'dashboard.greeting': 'Hello,',
    'dashboard.thisWeek': 'This week',
    'dashboard.targetReached': 'Target reached',
    'dashboard.today': 'Today',
  },
};

function getLocaleTag() {
  return state.currentLocale === 'fr' ? 'fr-FR' : 'en-US';
}

// Override the global next-intl mock with locale-aware behavior
vi.mock('next-intl', () => ({
  useLocale: () => state.currentLocale,
  useTranslations: (namespace: string) => {
    return (key: string) => {
      const fullKey = `${namespace}.${key}`;
      return translations[state.currentLocale]?.[fullKey] ?? fullKey;
    };
  },
  useFormatter: () => ({
    dateTime: (date: Date, options: Intl.DateTimeFormatOptions) => {
      return new Intl.DateTimeFormat(getLocaleTag(), options).format(date);
    },
    number: (value: number, options?: Intl.NumberFormatOptions) => {
      return new Intl.NumberFormat(getLocaleTag(), options).format(value);
    },
    relativeTime: (date: Date, reference: Date) => {
      const diff = date.getTime() - reference.getTime();
      const days = Math.round(diff / (1000 * 60 * 60 * 24));
      if (state.currentLocale === 'fr') {
        if (days < 0) return `il y a ${Math.abs(days)} jours`;
        if (days > 0) return `dans ${days} jours`;
        return "aujourd'hui";
      }
      if (days < 0) return `${Math.abs(days)} days ago`;
      if (days > 0) return `in ${days} days`;
      return 'today';
    },
    dateTimeRange: (start: Date, end: Date, options: Intl.DateTimeFormatOptions) => {
      const formatter = new Intl.DateTimeFormat(getLocaleTag(), options);
      return `${formatter.format(start)} – ${formatter.format(end)}`;
    },
  }),
}));

// Import hooks after mocks are set up
import { useFormattedDate } from '../useFormattedDate';
import { useFormattedNumber } from '../useFormattedNumber';
import { useLocale, useTranslations, useFormatter } from 'next-intl';

// Test component exercising all i18n features together
function I18nIntegrationComponent() {
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const format = useFormatter();
  const { formatDate, formatTime } = useFormattedDate();
  const { formatHours, formatCurrency } = useFormattedNumber();

  const testDate = new Date(2024, 10, 20, 14, 30); // Nov 20, 2024 14:30

  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="greeting">{t('greeting')}</span>
      <span data-testid="thisWeek">{t('thisWeek')}</span>
      <span data-testid="today">{t('today')}</span>
      <span data-testid="date-full">{formatDate(testDate, 'full')}</span>
      <span data-testid="date-short">{formatDate(testDate, 'short')}</span>
      <span data-testid="time">{formatTime(testDate)}</span>
      <span data-testid="hours">{formatHours(35)}</span>
      <span data-testid="currency">{formatCurrency(99.99, 'EUR')}</span>
      <span data-testid="number">{format.number(1234.56)}</span>
    </div>
  );
}

describe('i18n Integration — FR locale', () => {
  beforeEach(() => {
    state.currentLocale = 'fr';
  });

  it('returns fr as current locale', () => {
    render(<I18nIntegrationComponent />);
    expect(screen.getByTestId('locale')).toHaveTextContent('fr');
  });

  it('renders dashboard translations in French', () => {
    render(<I18nIntegrationComponent />);
    expect(screen.getByTestId('greeting')).toHaveTextContent('Bonjour,');
    expect(screen.getByTestId('thisWeek')).toHaveTextContent('Cette semaine');
    expect(screen.getByTestId('today')).toHaveTextContent("Aujourd'hui");
  });

  it('formats dates in French locale', () => {
    render(<I18nIntegrationComponent />);
    const fullDate = screen.getByTestId('date-full').textContent!;
    expect(fullDate).toContain('novembre');
    expect(fullDate).toContain('2024');
  });

  it('formats time in 24h format (FR)', () => {
    render(<I18nIntegrationComponent />);
    expect(screen.getByTestId('time')).toHaveTextContent('14:30');
  });

  it('formats hours with locale-aware number + h suffix', () => {
    render(<I18nIntegrationComponent />);
    expect(screen.getByTestId('hours').textContent).toContain('35');
    expect(screen.getByTestId('hours').textContent).toContain('h');
  });

  it('formats currency in FR locale (EUR)', () => {
    render(<I18nIntegrationComponent />);
    const currency = screen.getByTestId('currency').textContent!;
    expect(currency).toContain('€');
    expect(currency).toContain('99,99');
  });

  it('formats numbers with French separators', () => {
    render(<I18nIntegrationComponent />);
    const numberText = screen.getByTestId('number').textContent!;
    // French uses NBSP as thousands separator and comma for decimals
    expect(numberText).toMatch(/1[\s\u00A0\u202F]?234,56/);
  });
});

describe('i18n Integration — EN locale', () => {
  beforeEach(() => {
    state.currentLocale = 'en';
  });

  it('returns en as current locale', () => {
    render(<I18nIntegrationComponent />);
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
  });

  it('renders dashboard translations in English', () => {
    render(<I18nIntegrationComponent />);
    expect(screen.getByTestId('greeting')).toHaveTextContent('Hello,');
    expect(screen.getByTestId('thisWeek')).toHaveTextContent('This week');
    expect(screen.getByTestId('today')).toHaveTextContent('Today');
  });

  it('formats dates in English locale', () => {
    render(<I18nIntegrationComponent />);
    const fullDate = screen.getByTestId('date-full').textContent!;
    expect(fullDate).toContain('November');
    expect(fullDate).toContain('2024');
  });

  it('formats time in 12h format (EN)', () => {
    render(<I18nIntegrationComponent />);
    const timeText = screen.getByTestId('time').textContent!;
    expect(timeText).toMatch(/2:30\s?(PM|pm)/);
  });

  it('formats currency in EN locale (EUR)', () => {
    render(<I18nIntegrationComponent />);
    const currency = screen.getByTestId('currency').textContent!;
    expect(currency).toContain('€');
    expect(currency).toContain('99.99');
  });

  it('formats numbers with English separators', () => {
    render(<I18nIntegrationComponent />);
    expect(screen.getByTestId('number')).toHaveTextContent('1,234.56');
  });
});

describe('i18n Integration — Locale switching simulation', () => {
  it('switching locale changes all outputs', () => {
    // Render in FR
    state.currentLocale = 'fr';
    const { unmount: unmountFr } = render(<I18nIntegrationComponent />);
    expect(screen.getByTestId('greeting')).toHaveTextContent('Bonjour,');
    const frDate = screen.getByTestId('date-full').textContent!;
    expect(frDate).toContain('novembre');
    unmountFr();

    // Switch to EN
    state.currentLocale = 'en';
    render(<I18nIntegrationComponent />);
    expect(screen.getByTestId('greeting')).toHaveTextContent('Hello,');
    const enDate = screen.getByTestId('date-full').textContent!;
    expect(enDate).toContain('November');
  });
});
