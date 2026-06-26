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
    it('parses currency-prefixed values (rounded to whole dollars)', () => {
      expect(parseMoney('$100')).toBe(100);
      expect(parseMoney('$1,234.56')).toBe(1235);
    });
    it('parses decimals with rounding', () => {
      expect(parseMoney('1234.56')).toBe(1235);
      expect(parseMoney('0.99')).toBe(1);
    });
    it('parses leading-minus negatives', () => {
      expect(parseMoney('-100')).toBe(-100);
      expect(parseMoney('-1,000.50')).toBe(-1001);
    });
    it('parses parens as negative (accounting-style)', () => {
      expect(parseMoney('(500)')).toBe(-500);
      expect(parseMoney('($1,234.56)')).toBe(-1235);
      expect(parseMoney('(0)')).toBe(0);
    });
    it('strips whitespace', () => {
      expect(parseMoney('  100  ')).toBe(100);
      expect(parseMoney('1 000')).toBe(1000);
    });
  });

  describe('passthrough for already-numeric', () => {
    it('returns rounded finite numbers', () => {
      expect(parseMoney(1234)).toBe(1234);
      expect(parseMoney(-1234.5)).toBe(-1234);
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
    it('treats comma as thousand separator, NOT as field delimiter', () => {
      expect(parseMoney('100,000')).toBe(100000);
      expect(parseMoney('100,000')).not.toBe(100);
    });
  });
});

describe('formatMoney (fmt alias)', () => {
  it('formats positive whole numbers without cents', () => {
    expect(formatMoney(1234)).toBe('$1,234');
  });
  it('formats negative numbers with accounting parentheses', () => {
    expect(formatMoney(-1234)).toBe('($1,234)');
  });
  it('formats zero', () => {
    expect(formatMoney(0)).toBe('$0');
  });
  it('rounds to whole dollars', () => {
    expect(formatMoney(1.234)).toBe('$1');
    expect(formatMoney(1.235)).toBe('$1');
  });
  it('coerces non-finite to $0', () => {
    expect(formatMoney(NaN)).toBe('$0');
    expect(formatMoney(Infinity)).toBe('$0');
  });
});

describe('formatMoneyForInput', () => {
  it('returns plain rounded string for zero', () => {
    expect(formatMoneyForInput(0)).toBe('0');
  });
  it('formats whole numbers without commas or $', () => {
    expect(formatMoneyForInput(1234)).toBe('1234');
  });
  it('rounds decimals', () => {
    expect(formatMoneyForInput(1234.5)).toBe('1235');
  });
  it('formats negatives', () => {
    expect(formatMoneyForInput(-1234)).toBe('-1234');
  });
});

describe('parse -> format -> parse round-trip', () => {
  const cases = [0, 1, -1, 100, -100, 1235, -1235, 1000000];
  cases.forEach((n) => {
    it(`round-trips ${n}`, () => {
      expect(parseMoney(formatMoney(n))).toBe(n);
      expect(parseMoney(formatMoneyForInput(n) || '0')).toBe(n);
    });
  });
});
