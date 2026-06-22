import { addDays, getHours, getMinutes, isSameDay, isToday, startOfWeek } from 'date-fns';
import type { WeekStartsOn } from '../types';

/** The seven dates of the week containing `date`, starting on `weekStartsOn`. */
export const getWeekDays = (date: Date, weekStartsOn: WeekStartsOn): Date[] => {
  const start = startOfWeek(date, { weekStartsOn });
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
};

export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

export const getIsToday = (date: Date): boolean => isToday(date);

export const isSameCalendarDay = (a: Date, b: Date): boolean => isSameDay(a, b);

/** Minutes elapsed since midnight (0–1439). */
export const minutesIntoDay = (date: Date): number => getHours(date) * 60 + getMinutes(date);
