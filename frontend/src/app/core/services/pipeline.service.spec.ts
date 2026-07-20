import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PipelineRun } from '../models';
import { PipelineService } from './pipeline.service';

describe('PipelineService', () => {
  let service: PipelineService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PipelineService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts a source in the run trigger body', () => {
    service.run('sample_drones.json').subscribe();
    const req = httpMock.expectOne('/api/pipeline/run');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ source: 'sample_drones.json' });
    req.flush({} as PipelineRun);
  });

  it('posts a null source when none is given', () => {
    service.run().subscribe();
    const req = httpMock.expectOne('/api/pipeline/run');
    expect(req.request.body).toEqual({ source: null });
    req.flush({} as PipelineRun);
  });

  it('requests run history with a limit param', () => {
    service.listRuns(5).subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/pipeline/runs');
    expect(req.request.params.get('limit')).toBe('5');
    req.flush([]);
  });
});
