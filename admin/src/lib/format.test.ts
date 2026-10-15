// Task 4.3: how the portal writes numbers and ages (Design Brief §13).
import { describe, expect, it } from 'vitest';
import { ageSince, count, delta, percent, shortDay } from './format';

describe('counts', () => {
  it('stay in full up to 9,999, then go compact so a KPI row does not reflow', () => {
    expect(count(0)).toBe('0');
    expect(count(1284)).toBe('1,284');
    expect(count(9999)).toBe('9,999');
    expect(count(12_900)).toBe('12.9K');
    expect(count(4_200_000)).toBe('4.2M');
  });

  it('say so when there is no number rather than printing NaN', () => {
    expect(count(Number.NaN)).toBe('—');
  });
});

describe('percentages', () => {
  it('arrive as 0-100 from the database and keep one decimal only while small', () => {
    expect(percent(4.23)).toBe('4.2%');
    expect(percent(41.7)).toBe('42%');
    expect(percent(46.1)).toBe('46%');
    expect(percent(100)).toBe('100%');
  });
});

describe('the change against the start of the range', () => {
  it('is signed, and names no change instead of "+0"', () => {
    expect(delta(100, 142, 'count')).toBe('+42');
    expect(delta(142, 100, 'count')).toBe('−42');
    expect(delta(100, 100, 'count')).toBe('no change');
  });

  it('is a percentage-point move for percentage metrics', () => {
    expect(delta(40, 44.5, 'percent')).toBe('+4.5%');
  });

  it('is left out when there is nothing to compare with', () => {
    expect(delta(Number.NaN, 10, 'count')).toBeNull();
  });
});

describe('days and ages', () => {
  it('writes a plain API date shortly', () => {
    expect(shortDay('2026-10-15')).toBe('15 Oct');
    expect(shortDay('not-a-day')).toBe('not-a-day');
  });

  it('rounds an age to the unit a moderator can act on', () => {
    const now = new Date('2026-10-15T12:00:00Z').getTime();
    expect(ageSince('2026-10-15T11:30:00Z', now)).toBe('30 min');
    expect(ageSince('2026-10-15T04:00:00Z', now)).toBe('8 h');
    expect(ageSince('2026-10-11T12:00:00Z', now)).toBe('4 days');
  });
});
