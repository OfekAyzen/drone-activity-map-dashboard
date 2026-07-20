import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE } from '../config';
import { PipelineRun } from '../models';

@Injectable({ providedIn: 'root' })
export class PipelineService {
  private readonly http = inject(HttpClient);

  run(source?: string): Observable<PipelineRun> {
    return this.http.post<PipelineRun>(`${API_BASE}/pipeline/run`, { source: source ?? null });
  }

  listRuns(limit = 20): Observable<PipelineRun[]> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<PipelineRun[]>(`${API_BASE}/pipeline/runs`, { params });
  }
}
