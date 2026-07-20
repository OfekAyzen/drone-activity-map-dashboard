export type DroneStatus = 'active' | 'landed' | 'lost_signal';

export interface DroneRecord {
  id: number;
  drone_id: string;
  drone_type: string;
  operator_id: string;
  latitude: number;
  longitude: number;
  altitude_m: number;
  speed_kmh: number;
  battery_percent: number;
  timestamp: string;
  status: DroneStatus;
  source: string;
  ingested_at: string;
}

export interface DroneFilters {
  drone_type?: string;
  status?: DroneStatus;
  operator_id?: string;
  min_battery?: number;
  from?: string;
  to?: string;
}
