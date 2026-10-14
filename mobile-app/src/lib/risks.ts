/** "in about 2–4 h", "within an hour": plain-language lead time for a knock-on effect. */
export const leadText = ([min, max]: [number, number]): string => (max <= 1 ? 'within an hour' : min === 0 ? `within ${max} h` : min === max ? `in about ${min} h` : `in about ${min}–${max} h`);
