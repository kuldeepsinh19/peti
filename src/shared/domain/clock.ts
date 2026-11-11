/** Port for the current time, so deadlines and "today in IST" are testable. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(
  instant: Date | string,
): Clock & { set(next: Date | string): void; advance(ms: number): void } {
  let current = new Date(instant);
  return {
    now: () => new Date(current),
    set: (next) => {
      current = new Date(next);
    },
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

export const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;
