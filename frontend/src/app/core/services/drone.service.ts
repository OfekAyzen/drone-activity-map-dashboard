import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE } from '../config';
import { DroneFilters, DroneRecord, Page } from '../models';

@Injectable({ providedIn: 'root' })
export class DroneService {
  private readonly http = inject(HttpClient);

  list(filters: DroneFilters, limit: number, offset: number): Observable<Page<DroneRecord>> {
    return this.http.get<Page<DroneRecord>>(`${API_BASE}/drones`, {
      params: this.buildParams(filters, limit, offset),
    });
  }

  listLatest(filters: DroneFilters, limit: number, offset: number): Observable<Page<DroneRecord>> {
    return this.http.get<Page<DroneRecord>>(`${API_BASE}/drones/latest`, {
      params: this.buildParams(filters, limit, offset),
    });
  }

  private buildParams(filters: DroneFilters, limit: number, offset: number): HttpParams {
    let params = new HttpParams().set('limit', limit).set('offset', offset);

    if (filters.drone_type) params = params.set('drone_type', filters.drone_type);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.operator_id) params = params.set('operator_id', filters.operator_id);
    if (filters.min_battery != null) params = params.set('min_battery', filters.min_battery);
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);

    return params;
  }

  get(id: number): Observable<DroneRecord> {
    return this.http.get<DroneRecord>(`${API_BASE}/drones/${id}`);
  }

  history(droneId: string): Observable<Page<DroneRecord>> {
    const params = new HttpParams().set('drone_id', droneId).set('limit', 500).set('offset', 0);
    return this.http.get<Page<DroneRecord>>(`${API_BASE}/drones`, { params });
  }
}
