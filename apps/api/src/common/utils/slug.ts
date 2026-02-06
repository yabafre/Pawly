import { randomBytes } from 'crypto';

/**
 * Generate a URL-safe slug from a clinic name.
 * Removes accents, lowercases, kebab-cases, and appends a 4-byte random hex suffix.
 */
export function generateSlug(clinicName: string): string {
  const base = clinicName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = randomBytes(4).toString('hex');
  return `${base}-${suffix}`;
}
