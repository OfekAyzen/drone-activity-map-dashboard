import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DroneRecord, Page } from '../models';
import { DroneService } from './drone.service';

describe('DroneService', () => {
  let service: DroneService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DroneService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sends only limit/offset when no filters are set', () => {
    service.list({}, 50, 0).subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === '/api/drones' && r.params.get('limit') === '50' && r.params.get('offset') === '0',
    );
    expect(req.request.params.keys().length).toBe(2);
    req.flush({ items: [], total: 0, limit: 50, offset: 0 } satisfies Page<DroneRecord>);
  });

  it('adds each populated filter as its own query param', () => {
    service
      .list(
        {
          drone_type: 'Quadcopter',
          status: 'active',
          operator_id: 'OP-123',
          min_battery: 50,
          from: '2026-06-01T00:00:00Z',
          to: '2026-06-28T00:00:00Z',
        },
        20,
        10,
      )
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/drones');
    expect(req.request.params.get('drone_type')).toBe('Quadcopter');
    expect(req.request.params.get('status')).toBe('active');
    expect(req.request.params.get('operator_id')).toBe('OP-123');
    expect(req.request.params.get('min_battery')).toBe('50');
    expect(req.request.params.get('from')).toBe('2026-06-01T00:00:00Z');
    expect(req.request.params.get('to')).toBe('2026-06-28T00:00:00Z');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.get('offset')).toBe('10');
    req.flush({ items: [], total: 0, limit: 20, offset: 10 } satisfies Page<DroneRecord>);
  });

  it('listLatest() sends only limit/offset when no filters are set', () => {
    service.listLatest({}, 50, 0).subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === '/api/drones/latest' && r.params.get('limit') === '50' && r.params.get('offset') === '0',
    );
    expect(req.request.params.keys().length).toBe(2);
    req.flush({ items: [], total: 0, limit: 50, offset: 0 } satisfies Page<DroneRecord>);
  });

  it('listLatest() forwards each populated filter as its own query param', () => {
    service
      .listLatest(
        {
          drone_type: 'Quadcopter',
          status: 'active',
          operator_id: 'OP-123',
          min_battery: 50,
          from: '2026-06-01T00:00:00Z',
          to: '2026-06-28T00:00:00Z',
        },
        20,
        10,
      )
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/drones/latest');
    expect(req.request.params.get('drone_type')).toBe('Quadcopter');
    expect(req.request.params.get('status')).toBe('active');
    expect(req.request.params.get('operator_id')).toBe('OP-123');
    expect(req.request.params.get('min_battery')).toBe('50');
    expect(req.request.params.get('from')).toBe('2026-06-01T00:00:00Z');
    expect(req.request.params.get('to')).toBe('2026-06-28T00:00:00Z');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.get('offset')).toBe('10');
    req.flush({ items: [], total: 0, limit: 20, offset: 10 } satisfies Page<DroneRecord>);
  });

  it('gets a single drone record by id', () => {
    service.get(7).subscribe();
    const req = httpMock.expectOne('/api/drones/7');
    expect(req.request.method).toBe('GET');
    req.flush({} as DroneRecord);
  });

  it('history() filters by drone_id with a high limit', () => {
    service.history('DRONE-001').subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === '/api/drones' && r.params.get('drone_id') === 'DRONE-001',
    );
    expect(req.request.params.get('limit')).toBe('500');
    req.flush({ items: [], total: 0, limit: 500, offset: 0 } satisfies Page<DroneRecord>);
  });
});
