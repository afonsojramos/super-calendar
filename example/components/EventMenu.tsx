import { createContext, useContext } from "react";
import type { CalendarEvent } from "react-native-bigger-calendar";

/** Actions the example's right-click menu can perform on an event. */
export type EventMenuActions = {
  shift: (event: CalendarEvent, minutes: number) => void;
  remove: (event: CalendarEvent) => void;
};

const EventMenuContext = createContext<EventMenuActions | null>(null);

export const EventMenuProvider = EventMenuContext.Provider;
export const useEventMenuActions = () => useContext(EventMenuContext);
