import { Calendar, createEventSource, type SolidCalendarTheme } from "@super-calendar/solid";

export function FeedExample(props: { date: Date; theme?: Partial<SolidCalendarTheme> }) {
  const feed = createEventSource(() => `${import.meta.env.BASE_URL}events.json`);
  return (
    <>
      <div aria-label="Event feed">
        <button disabled={feed.loading()} onClick={() => void feed.refetch()}>
          Refresh feed
        </button>
        <p role="status">
          {feed.loading()
            ? "Loading feed"
            : feed.error()
              ? `Could not refresh: ${feed.error()!.message}`
              : "Feed up to date"}
        </p>
      </div>
      <Calendar
        date={props.date}
        mode="week"
        events={feed.events()}
        theme={props.theme}
        now={props.date}
        height={560}
        minHour={7}
        maxHour={20}
        weekStartsOn={1}
      />
    </>
  );
}
