import { describe, expect, it } from 'vitest';
import { deliveryCities, deliveryZones, findDeliveryZone, zoneById, zoneTerm } from './delivery-zones';

describe('база сроков доставки по федеральным округам', () => {
  it('повторяет сроки, заданные владельцем, без вымышленных значений', () => {
    expect(deliveryZones.map(zone => [zone.districts, zone.min, zone.max])).toEqual([
      ['ЦФО', 3, 5], ['СЗФО', 4, 6], ['ПФО', 4, 7], ['ЮФО и СКФО', 5, 8],
      ['УФО', 6, 9], ['СФО', 7, 11], ['ДФО', 14, 21],
    ]);
  });

  it('находит округ по городу независимо от регистра, ё, дефисов и приставки «г.»', () => {
    expect(findDeliveryZone('Москва')?.id).toBe('cfo');
    expect(findDeliveryZone('  г. орёл ')?.id).toBe('cfo');
    expect(findDeliveryZone('ростов на дону')?.id).toBe('south');
    expect(findDeliveryZone('Ростов-на-Дону')?.id).toBe('south');
    expect(findDeliveryZone('СПб')?.id).toBe('szfo');
    expect(findDeliveryZone('Владивосток')?.id).toBe('far-east');
    expect(findDeliveryZone('Тюмень')?.id).toBe('ural');
  });

  it('не выдумывает округ для неизвестного или пустого направления', () => {
    expect(findDeliveryZone('Неизвестный город')).toBeNull();
    expect(findDeliveryZone('  ')).toBeNull();
    expect(zoneById('нет такого')).toBeUndefined();
  });

  it('не относит один город к двум округам', () => {
    const all = deliveryZones.flatMap(zone => zone.cities);
    const seen = new Map<string, string>();
    for (const zone of deliveryZones) {
      for (const city of zone.cities) {
        const key = city.toLocaleLowerCase('ru').replace(/ё/g, 'е');
        expect(seen.get(key), `${city} повторяется`).toBeUndefined();
        seen.set(key, zone.id);
      }
    }
    expect(deliveryCities).toHaveLength(all.length);
  });

  it('показывает дальние направления неделями, а остальные — днями', () => {
    expect(zoneTerm({ min: 3, max: 5 })).toBe('3–5 дн.');
    expect(zoneTerm({ min: 14, max: 21 })).toBe('2–3 недели');
    expect(zoneTerm({ min: 4, max: 4 })).toBe('4 дн.');
  });

  it('подсказывает города по алфавиту и включает города каждого округа', () => {
    expect(deliveryCities).toEqual([...deliveryCities].sort((first, second) => first.localeCompare(second, 'ru-RU')));
    for (const zone of deliveryZones) expect(deliveryCities).toContain(zone.cities[0]);
  });
});
