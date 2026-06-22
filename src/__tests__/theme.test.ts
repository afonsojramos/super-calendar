import { defaultTheme, mergeTheme } from '../theme';

describe('mergeTheme', () => {
  it('returns the default theme when given nothing', () => {
    expect(mergeTheme()).toBe(defaultTheme);
  });

  it('overrides only the provided colours and keeps the rest', () => {
    const merged = mergeTheme({ colors: { todayBackground: '#FF0000' } });
    expect(merged.colors.todayBackground).toBe('#FF0000');
    expect(merged.colors.gridLine).toBe(defaultTheme.colors.gridLine);
    expect(merged.colors.text).toBe(defaultTheme.colors.text);
  });

  it('overrides only the provided text styles and keeps the rest', () => {
    const merged = mergeTheme({ text: { dayNumber: { fontSize: 30 } } });
    expect(merged.text.dayNumber).toEqual({ fontSize: 30 });
    expect(merged.text.weekday).toEqual(defaultTheme.text.weekday);
  });

  it('overrides the today badge radius', () => {
    expect(mergeTheme({ todayBadgeRadius: 8 }).todayBadgeRadius).toBe(8);
    expect(mergeTheme({}).todayBadgeRadius).toBe(defaultTheme.todayBadgeRadius);
  });

  it('does not mutate the default theme', () => {
    mergeTheme({ colors: { gridLine: '#123456' } });
    expect(defaultTheme.colors.gridLine).not.toBe('#123456');
  });
});
