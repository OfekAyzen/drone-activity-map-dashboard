import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { DroneRecord } from '../../../core/models';
import { MapComponent } from './map.component';

function makeRecord(overrides: Partial<DroneRecord>): DroneRecord {
  return {
    id: 1,
    drone_id: 'DRONE-001',
    drone_type: 'Quadcopter',
    operator_id: 'OP-123',
    latitude: 32.0853,
    longitude: 34.7818,
    altitude_m: 120,
    speed_kmh: 45,
    battery_percent: 76,
    timestamp: '2026-06-28T10:30:00Z',
    status: 'active',
    source: 'sample_drones.json',
    ingested_at: '2026-06-28T10:30:05Z',
    ...overrides,
  };
}

describe('MapComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<MapComponent>>;
  let component: MapComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MapComponent] });
    fixture = TestBed.createComponent(MapComponent);
    component = fixture.componentInstance;
  });

  it('renders one marker per point', () => {
    fixture.componentRef.setInput('points', [
      makeRecord({ id: 1, drone_id: 'DRONE-001' }),
      makeRecord({ id: 2, drone_id: 'DRONE-002', latitude: 31.9, longitude: 35.0 }),
    ]);
    fixture.detectChanges();

    const markers = fixture.nativeElement.querySelectorAll('.leaflet-interactive');
    expect(markers.length).toBe(2);
  });

  it('reacts to points changing after the map is already initialized', () => {
    fixture.componentRef.setInput('points', [makeRecord({ id: 1 })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.leaflet-interactive').length).toBe(1);

    fixture.componentRef.setInput('points', [
      makeRecord({ id: 1 }),
      makeRecord({ id: 2, drone_id: 'DRONE-002', latitude: 31.9, longitude: 35.0 }),
      makeRecord({ id: 3, drone_id: 'DRONE-003', latitude: 32.79, longitude: 34.98 }),
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.leaflet-interactive').length).toBe(3);
  });

  it('emits droneSelected with the drone_id when a marker is clicked', () => {
    fixture.componentRef.setInput('points', [makeRecord({ id: 1, drone_id: 'DRONE-001' })]);
    fixture.detectChanges();

    let emitted: string | undefined;
    component.droneSelected.subscribe((id) => (emitted = id));

    const marker = fixture.nativeElement.querySelector('.leaflet-interactive') as HTMLElement;
    marker.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(emitted).toBe('DRONE-001');
  });

  it('draws no path for fewer than two points and does not throw', () => {
    fixture.componentRef.setInput('points', []);
    fixture.componentRef.setInput('pathPoints', [makeRecord({ id: 1 })]);
    expect(() => fixture.detectChanges()).not.toThrow();
  });
});
