import { kitchen } from '../../../backend/club-settings.json';

export const KITCHEN_HOURS = `${kitchen.opens}–${kitchen.closes}`;
export const KITCHEN_TIME_ZONE_LABEL = kitchen.time_zone_label;

export const TEMPERATURE_LABELS = {
  cold: 'Холодный',
  warm: 'Комнатной температуры',
};

export function unavailableLabel(item) {
  if (item?.unavailable_reason === 'kitchen_closed') return 'Кухня закрыта';
  if (!item?.is_available) return 'Временно нет';
  return '';
}

export function hasOptions(item) {
  return Boolean(item.removable_ingredients?.length || item.temperature_options?.length);
}

export function selectionMatches(item, selection) {
  const temperatures = item.temperature_options || [];
  return (
    (temperatures.length ? temperatures.includes(selection.temperature) : !selection.temperature) &&
    (selection.removed_ingredients || []).every((ingredient) =>
      item.removable_ingredients?.includes(ingredient),
    )
  );
}
