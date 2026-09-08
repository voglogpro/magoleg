export type DeliveryEstimate = { city: string; min: number; max: number; cost: string };
export const cityKey = (city: string) => city.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ');

/** Owner estimates, not CDEK API quotes. Invalid rows never become shopper-facing promises. */
export function parseDeliverySchedule(text: string): DeliveryEstimate[] {
  const seen = new Set<string>();
  return text.split(/\r?\n/).flatMap(line => {
    if (!line.trim()) return [];
    const parts = line.split(';').map(part => part.trim());
    const [city, from, to, cost] = parts;
    const min = Number(from), max = Number(to);
    if (parts.length !== 4 || city.length < 2 || city.length > 80 || !/^\d{1,2}$/.test(from) || !/^\d{1,2}$/.test(to)
      || min < 1 || max < min || max > 90 || !cost || cost.length > 150 || seen.has(cityKey(city))) return [];
    seen.add(cityKey(city));
    return [{ city, min, max, cost }];
  });
}
