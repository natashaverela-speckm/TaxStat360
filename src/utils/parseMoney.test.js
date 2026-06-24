// src/utils/parseMoney.test.js
import { describe, it, expect } from 'vitest';
import { parseMoney, formatMoney, formatMoneyForInput } from './money.js';

describe('parseMoney', () => {
  describe('happy path', () => {
    it('parses plain integers', () => {
      expect(parseMoney('1234')).toBe(1234);
    });
    it('parses thousand-separated values', () => {
      expect(parseMoney('100,000')).toBe(100000);
      expect(parseMoney('1,234,567')).toBe(1234567);
    });
    it('parses currency-prefixed values', () => {
      expect(parseMoney('$100')).toBe(100);
      expect(parseMoney('$1,234.56')).toBe(1234.56);
    });
    it('parses decimals', () => {
      expect(parseMoney('1234.56')).toBe(1234.56);
      expect(parseMoney('0.99')).toBe(0.99);
    });
    it('parses leading-minus negatives', () => {
      expect(parseMoney('-100')).toBe(-100);
      expect(parseMoney('-1,000.50')).toBe(-1000.5);
    });
    it('parses parens as negative (accounting-style)', () => {
      expect(parseMoney('(500)')).toBe(-500);
      expect(parseMoney('($1,234.56)')).toBe(-1234.56);
      expect(parseMoney('(0)')).toBe(0);
    });
    it('strips whitespace', () => {
      expect(parseMoney('  100  ')).toBe(100);
      expect(parseMoney('1 000')).toBe(1000);
    });
  });

  describe('passthrough for already-numeric', () => {
    it('returns finite numbers as-is', () => {
      expect(parseMoney(1234)).toBe(1234);
      expect(parseMoney(-1234.5)).toBe(-1234.5);
      expect(parseMoney(0)).toBe(0);
    });
    it('coerces non-finite numbers to 0', () => {
      expect(parseMoney(NaN)).toBe(0);
      expect(parseMoney(Infinity)).toBe(0);
      expect(parseMoney(-Infinity)).toBe(0);
    });
  });

  describe('empty / invalid', () => {
    it('returns 0 for null/undefined', () => {
      expect(parseMoney(null)).toBe(0);
      expect(parseMoney(undefined)).toBe(0);
    });
    it('returns 0 for empty / whitespace', () => {
      expect(parseMoney('')).toBe(0);
      expect(parseMoney('   ')).toBe(0);
    });
    it('returns 0 for non-parseable text (never NaN)', () => {
      expect(parseMoney('abc')).toBe(0);
      expect(parseMoney('twelve')).toBe(0);
      expect(parseMoney('-')).toBe(0);
      expect(parseMoney('.')).toBe(0);
      expect(parseMoney('()')).toBe(0);
    });
    it('NEVER returns NaN, Infinity, or -Infinity', () => {
      const inputs = [null, undefined, '', 'abc', NaN, Infinity, -Infinity, '$$$', '()'];
      for (const v of inputs) {
        const out = parseMoney(v);
        expect(Number.isFinite(out)).toBe(true);
      }
    });
  });

  describe('regression: comma parsing bug', () => {
    // The original bug: "100,000" was being read as 100 (split at comma)
    it('treats comma as thousand separator, NOT as field delimiter', () => {
      expect(parseMoney('100,000')).toBe(100000);
      expect(parseMoney('100,000')).not.toBe(100);
    });
  });
});

describe('formatMoney', () => {
  it('formats positive whole numbers', () => {
    expect(formatMoney(1234)).toBe('$1,234.00');
  });
  it('formats negative numbers with leading minus', () => {
    expect(formatMoney(-1234)).toBe('-$1,234.00');
  });
  it('formats zero', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });
  it('rounds to 2 decimals', () => {
    expect(formatMoney(1.234)).toBe('$1.23');
    expect(formatMoney(1.235)).toBe('$1.24');
  });
  it('coerces non-finite to 0', () => {
    expect(formatMoney(NaN)).toBe('$0.00');
    expect(formatMoney(Infinity)).toBe('$0.00');
  });
  it('respects cents:false option', () => {
    expect(formatMoney(1234, { cents: false })).toBe('$1,234');
  });
});

describe('formatMoneyForInput', () => {
  it('returns empty string for 0 (so placeholder shows)', () => {
    expect(formatMoneyForInput(0)).toBe('');
  });
  it('formats whole numbers without decimals', () => {
    expect(formatMoneyForInput(1234)).toBe('1,234');
  });
  it('formats decimals with 2 places', () => {
    expect(formatMoneyForInput(1234.5)).toBe('1,234.50');
  });
  it('formats negatives', () => {
    expect(formatMoneyForInput(-1234)).toBe('-1,234');
  });
});

describe('parse -> format -> parse round-trip', () => {
  // Anything we can format must be re-parseable to the same value.
  const cases = [0, 1, -1, 100, -100, 1234.56, -1234.56, 1000000, 0.01];
  cases.forEach((n) => {
    it(`round-trips ${n}`, () => {
      expect(parseMoney(formatMoney(n))).toBe(n);
      expect(parseMoney(formatMoneyForInput(n) || '0')).toBe(n);
    });
  });
});
