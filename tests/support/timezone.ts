// The forks pool gives each test file its own process and a real process.env.
export function useTimeZone(zone: string) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}
