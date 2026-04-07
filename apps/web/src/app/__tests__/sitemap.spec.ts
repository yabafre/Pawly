import { describe, it, expect } from 'vitest';
import sitemap from '../sitemap';

describe('sitemap', () => {
  it('returns an array of sitemap entries', () => {
    const result = sitemap();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('includes homepage entry with priority 1', () => {
    const result = sitemap();
    const homepage = result[0];

    expect(homepage.url).toBe('https://pawly.com');
    expect(homepage.priority).toBe(1);
    expect(homepage.changeFrequency).toBe('monthly');
  });

  it('includes pricing page entry with priority 0.8', () => {
    const result = sitemap();
    const pricing = result[1];

    expect(pricing.url).toBe('https://pawly.com/pricing');
    expect(pricing.priority).toBe(0.8);
    expect(pricing.changeFrequency).toBe('monthly');
  });

  it('includes login page entry with priority 0.3', () => {
    const result = sitemap();
    const login = result[2];

    expect(login.url).toBe('https://pawly.com/login');
    expect(login.priority).toBe(0.3);
    expect(login.changeFrequency).toBe('yearly');
  });

  it('includes locale alternates for homepage', () => {
    const result = sitemap();
    const homepage = result[0];

    expect(homepage.alternates?.languages).toEqual({
      fr: 'https://pawly.com',
      en: 'https://pawly.com/en',
    });
  });

  it('includes locale alternates for pricing page', () => {
    const result = sitemap();
    const pricing = result[1];

    expect(pricing.alternates?.languages).toEqual({
      fr: 'https://pawly.com/pricing',
      en: 'https://pawly.com/en/pricing',
    });
  });

  it('includes locale alternates for login page', () => {
    const result = sitemap();
    const login = result[2];

    expect(login.alternates?.languages).toEqual({
      fr: 'https://pawly.com/login',
      en: 'https://pawly.com/en/login',
    });
  });

  it('sets lastModified as Date object', () => {
    const result = sitemap();
    result.forEach(entry => {
      expect(entry.lastModified).toBeInstanceOf(Date);
    });
  });
});
