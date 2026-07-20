import { DroneRecord } from '../core/models';

// Keep these in sync with the CSS custom properties in src/styles.css
// (--status-active, --status-landed, --status-lost-signal, --status-low-battery).
export const STATUS_COLORS = {
  active: '#16a34a',
  landed: '#6b7280',
  lost_signal: '#dc2626',
  lowBattery: '#f59e0b',
} as const;

export const LOW_BATTERY_THRESHOLD = 20;

export function isLowBattery(record: Pick<DroneRecord, 'battery_percent'>): boolean {
  return record.battery_percent < LOW_BATTERY_THRESHOLD;
}

export function markerColor(record: Pick<DroneRecord, 'status' | 'battery_percent'>): string {
  if (record.status === 'lost_signal') return STATUS_COLORS.lost_signal;
  if (isLowBattery(record)) return STATUS_COLORS.lowBattery;
  if (record.status === 'active') return STATUS_COLORS.active;
  return STATUS_COLORS.landed;
}
