import { describe, it, expect } from 'vitest';
import robots from '../robots';

describe('robots', () => {
  it('returns robots configuration object', () => {
    const result = robots();
    expect(result).toBeDefined();
    expect(result.rules).toBeDefined();
  });

  it('allows all user agents to crawl root', () => {
    const result = robots();
    const rules = result.rules;

    // rules can be object or array
    if (Array.isArray(rules)) {
      expect(rules[0].userAgent).toBe('*');
      expect(rules[0].allow).toBe('/');
    } else {
      expect(rules.userAgent).toBe('*');
      expect(rules.allow).toBe('/');
    }
  });

  it('disallows admin, api, and onboarding routes', () => {
    const result = robots();
    const rules = result.rules;

    const disallow = Array.isArray(rules) ? rules[0].disallow : rules.disallow;
    expect(disallow).toContain('/admin/');
    expect(disallow).toContain('/api/');
    expect(disallow).toContain('/onboarding/');
  });

  it('includes sitemap URL', () => {
    const result = robots();
    expect(result.sitemap).toBe('https://pawly.com/sitemap.xml');
  });
});
