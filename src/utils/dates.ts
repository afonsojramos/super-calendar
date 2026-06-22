import { addDays, getHours, getMinutes, isSameDay, isToday, startOfDay, startOfWeek } from 'date-fns';
import type { CalendarMode, WeekStartsOn } from '../types';

/** The seven dates of the week containing `date`, starting on `weekStartsOn`. */
export const getWeekDays = (date: Date, weekStartsOn: WeekStartsOn): Date[] => {
  const start = startOfWeek(date, { weekStartsOn });
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
};

/** How many day columns a time-grid mode shows. `custom` uses `numberOfDays`. */
export const viewDayCount = (mode: CalendarMode, numberOfDays = 1): number => {
  switch (mode) {
    case 'week':
      return 7;
    case '3days':
      return 3;
    case 'custom':
      return Math.max(1, Math.floor(numberOfDays));
    default:
      return 1; // 'day'
  }
};

/**
 * Days in the inclusive span from `weekStartsOn` to `weekEndsOn` (1–7),
 * wrapping when the end precedes the start (e.g. Sat→Wed). Mirrors
 * react-native-big-calendar's `weekDaysCount`.
 */
export const weekDaysCount = (weekStartsOn: WeekStartsOn, weekEndsOn: WeekStartsOn): number => {
  if (weekEndsOn < weekStartsOn) {
    let count = 1;
    let i = weekStartsOn;
    while (i !== weekEndsOn && count <= 7) {
      i = (i + 1) % 7;
      count++;
    }
    return count;
  }
  if (weekEndsOn > weekStartsOn) return weekEndsOn - weekStartsOn + 1;
  return 1;
};

/**
 * The day columns to render for a time-grid page. `week` spans the calendar week
 * (honouring `weekStartsOn`). `custom` with a `weekEndsOn` spans the partial week
 * from `weekStartsOn` to `weekEndsOn` (anchored to `date`'s week, paging by week);
 * otherwise every mode shows `viewDayCount` consecutive days starting at `date`.
 */
export const getViewDays = (
  mode: CalendarMode,
  date: Date,
  weekStartsOn: WeekStartsOn,
  numberOfDays = 1,
  isRTL = false,
  weekEndsOn?: WeekStartsOn,
): Date[] => {
  let days: Date[];
  if (mode === 'week') {
    days = getWeekDays(date, weekStartsOn);
  } else if (mode === 'custom' && weekEndsOn != null) {
    // Mirror big-calendar: anchor to `date`'s week and take the partial-week span.
    const subject = startOfDay(date);
    const offset = weekStartsOn - subject.getDay();
    days = Array.from({ length: weekDaysCount(weekStartsOn, weekEndsOn) }, (_, index) =>
      addDays(subject, index + offset),
    );
  } else {
    days = Array.from({ length: viewDayCount(mode, numberOfDays) }, (_, index) =>
      addDays(startOfDay(date), index),
    );
  }
  return isRTL ? days.reverse() : days;
};

export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

export const getIsToday = (date: Date): boolean => isToday(date);

export const isSameCalendarDay = (a: Date, b: Date): boolean => isSameDay(a, b);

/** Minutes elapsed since midnight (0–1439). */
export const minutesIntoDay = (date: Date): number => getHours(date) * 60 + getMinutes(date);
