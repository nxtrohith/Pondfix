// The web and the mobile app are one product: same palette, same farmer wording. These checks fail when the two drift apart.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const css = fs.readFileSync(path.join(root, 'frontend/src/app/globals.css'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'mobile-app/src/constants/colors.ts'), 'utf8');
const webVar = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]?.toLowerCase();
const mobileHex = (name: string) => mobile.match(new RegExp(`\\b${name}: '(#[0-9A-Fa-f]{6})'`))?.[1]?.toLowerCase();

const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
const contrast = (a: string, b: string) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

describe('shared design tokens', () => {
  it.each([
    ['brand', 'teal'], ['brand-text', 'tealText'], ['brand-pale', 'tealPale'], ['page', 'page'], ['ink', 'ink'], ['ink-soft', 'inkSecondary'], ['line', 'hairline'],
    ['ok-text', 'healthyText'], ['ok-bg', 'healthySurface'], ['warn-text', 'warningText'], ['warn-bg', 'warningSurface'], ['crit-text', 'criticalText'], ['crit-bg', 'criticalSurface'],
  ])('web --color-%s equals mobile palette.%s', (web, mob) => {
    expect(webVar(web)).toBeDefined();
    expect(webVar(web)).toBe(mobileHex(mob));
  });
  it.each([
    ['ink', 'page'], ['ink-soft', 'page'], ['ink-soft', 'card'], ['brand-text', 'card'], ['ok-text', 'ok-bg'], ['warn-text', 'warn-bg'], ['crit-text', 'crit-bg'],
  ])('text %s on %s meets WCAG AA', (fg, bg) => {
    expect(contrast(webVar(fg)!, webVar(bg)!)).toBeGreaterThanOrEqual(4.5);
  });
  it('white text on the primary and urgent fills meets WCAG AA', () => {
    expect(contrast('#ffffff', webVar('brand')!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', webVar('crit-text')!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('shared farmer wording', () => {
  it('status verdicts, measurement explanations, action steps and connection states are identical on web and mobile', () => {
    const web = JSON.parse(fs.readFileSync(path.join(root, 'frontend/src/i18n/care.en.json'), 'utf8'));
    const app = JSON.parse(fs.readFileSync(path.join(root, 'mobile-app/src/i18n/locales/en/care.json'), 'utf8'));
    expect(app).toEqual(web);
  });
});
