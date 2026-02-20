#!/usr/bin/env tsx
/**
 * Translation Key Validation Script
 *
 * This script verifies that fr.json and en.json have identical key structures.
 * Run with: pnpm tsx scripts/check-translations.ts
 *
 * Exit codes:
 *   0 - All keys match
 *   1 - Missing keys detected
 */

import * as fs from 'fs';
import * as path from 'path';

const LANGS_DIR = path.join(__dirname, '../src/i18n/langs');

interface TranslationObject {
  [key: string]: string | TranslationObject;
}

/**
 * Recursively extract all keys from a nested object with dot notation
 */
function extractKeys(obj: TranslationObject, prefix = ''): string[] {
  const keys: string[] = [];

  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (typeof value === 'object' && value !== null) {
      keys.push(...extractKeys(value as TranslationObject, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

/**
 * Find keys that exist in source but not in target
 */
function findMissingKeys(sourceKeys: string[], targetKeys: string[]): string[] {
  const targetSet = new Set(targetKeys);
  return sourceKeys.filter((key) => !targetSet.has(key));
}

function main() {
  // Load translation files
  const frPath = path.join(LANGS_DIR, 'fr.json');
  const enPath = path.join(LANGS_DIR, 'en.json');

  if (!fs.existsSync(frPath)) {
    console.error('Error: fr.json not found at', frPath);
    process.exit(1);
  }

  if (!fs.existsSync(enPath)) {
    console.error('Error: en.json not found at', enPath);
    process.exit(1);
  }

  const frContent = JSON.parse(fs.readFileSync(frPath, 'utf-8')) as TranslationObject;
  const enContent = JSON.parse(fs.readFileSync(enPath, 'utf-8')) as TranslationObject;

  // Extract keys
  const frKeys = extractKeys(frContent).sort();
  const enKeys = extractKeys(enContent).sort();

  // Find missing keys
  const missingInEn = findMissingKeys(frKeys, enKeys);
  const missingInFr = findMissingKeys(enKeys, frKeys);

  let hasErrors = false;

  if (missingInEn.length > 0) {
    console.error('\n Missing in en.json (found in fr.json):');
    missingInEn.forEach((key) => console.error(`   - ${key}`));
    hasErrors = true;
  }

  if (missingInFr.length > 0) {
    console.error('\n Missing in fr.json (found in en.json):');
    missingInFr.forEach((key) => console.error(`   - ${key}`));
    hasErrors = true;
  }

  if (hasErrors) {
    console.error('\n Translation validation FAILED');
    console.error(
      `   Total: ${missingInEn.length} missing in en.json, ${missingInFr.length} missing in fr.json`
    );
    process.exit(1);
  }

  console.log(' Translation validation PASSED');
  console.log(`   Total keys: ${frKeys.length} (identical in both files)`);
  process.exit(0);
}

main();
