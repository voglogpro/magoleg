import { describe, expect, it } from 'vitest';
import { cityKey, parseDeliverySchedule } from './delivery-estimates';

describe('published owner delivery estimates', () => {
  it('parses exact inclusive ranges without inventing a CDEK quote', () => {
    expect(parseDeliverySchedule('Москва; 3; 5; По тарифу ТК')).toEqual([{ city: 'Москва', min: 3, max: 5, cost: 'По тарифу ТК' }]);
    expect(cityKey('  Орёл  ')).toBe('орел');
    expect(parseDeliverySchedule('')).toEqual([]);
  });
  it('rejects malformed, reversed, unrealistic, duplicate and incomplete estimates', () => {
    for (const line of ['Город; 5; 3; тариф', 'Город; 0; 3; тариф', 'Город; 1; 91; тариф', 'Город; 1; 3;', 'Город; завтра; 3; тариф', 'Город; 1; 2; тариф; extra']) expect(parseDeliverySchedule(line)).toEqual([]);
    expect(parseDeliverySchedule('Орёл; 2; 4; ТК\nорел; 3; 5; ТК')).toHaveLength(1);
  });
});
