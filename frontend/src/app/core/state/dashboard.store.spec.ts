import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PipelineRun } from '../models';
import { DashboardStore } from './dashboard.store';

const emptyPage = { items: [], total: 0, limit: 50, offset: 0 };

function makeRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id: 1,
    started_at: '2026-07-20T00:00:00Z',
    finished_at: null,
    status: 'started',
    source: 'sample.json',
    total_records: 0,
    valid_records: 0,
    invalid_records: 0,
    error_message: null,
    ...overrides,
  };
}

describe('DashboardStore', () => {
  let store: DashboardStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(DashboardStore);
    httpMock = TestBed.inject(HttpTestingController);

    vi.advanceTimersByTime(200); // initial refresh$ debounce
    httpMock.expectOne((r) => r.url === '/api/drones/latest').flush(emptyPage);
    httpMock.expectOne((r) => r.url === '/api/pipeline/runs').flush([]);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('does not poll and refreshes immediately when the run does not come back started', () => {
    store.runPipeline();

    const triggerReq = httpMock.expectOne((r) => r.url === '/api/pipeline/run');
    triggerReq.flush(makeRun({ id: 7, status: 'completed' }));

    // refreshRuns() fires synchronously (no debounce)
    httpMock.expectOne((r) => r.url === '/api/pipeline/runs').flush([makeRun({ id: 7, status: 'completed' })]);

    vi.advanceTimersByTime(200); // refresh$ debounce for the drones refetch
    httpMock.expectOne((r) => r.url === '/api/drones/latest').flush(emptyPage);

    expect(store.runs()).toEqual([makeRun({ id: 7, status: 'completed' })]);

    // confirm no poll loop was started
    vi.advanceTimersByTime(1500);
    httpMock.expectNone((r) => r.url === '/api/pipeline/runs');
  });

  it('polls pipeline runs until the triggered run resolves, then refreshes once', () => {
    store.runPipeline('sample.json');

    const triggerReq = httpMock.expectOne((r) => r.url === '/api/pipeline/run');
    triggerReq.flush(makeRun({ id: 42, status: 'started' }));

    // the triggered run is shown optimistically as "started" right away, before any poll tick
    expect(store.runs()).toEqual([makeRun({ id: 42, status: 'started' })]);

    // no poll request until the first interval tick
    httpMock.expectNone((r) => r.url === '/api/pipeline/runs');

    vi.advanceTimersByTime(1500);
    httpMock
      .expectOne((r) => r.url === '/api/pipeline/runs')
      .flush([makeRun({ id: 42, status: 'started' })]);

    // still started: optimistic entry untouched, no drones refetch triggered
    expect(store.runs()).toEqual([makeRun({ id: 42, status: 'started' })]);

    vi.advanceTimersByTime(1500);
    httpMock
      .expectOne((r) => r.url === '/api/pipeline/runs')
      .flush([makeRun({ id: 42, status: 'completed' })]);

    // poll resolved: runs updated straight from the poll response
    expect(store.runs()).toEqual([makeRun({ id: 42, status: 'completed' })]);

    vi.advanceTimersByTime(200); // refresh$ debounce
    httpMock.expectOne((r) => r.url === '/api/drones/latest').flush(emptyPage);

    // polling has stopped
    vi.advanceTimersByTime(1500);
    httpMock.expectNone((r) => r.url === '/api/pipeline/runs');
  });

  it('cancels the previous poll loop when a run is triggered again before the first resolves', () => {
    store.runPipeline();
    httpMock.expectOne((r) => r.url === '/api/pipeline/run').flush(makeRun({ id: 1, status: 'started' }));

    // second click lands before run 1's poll has even ticked once
    store.runPipeline();
    httpMock.expectOne((r) => r.url === '/api/pipeline/run').flush(makeRun({ id: 2, status: 'started' }));

    // only run 2's poll loop should be alive: a single tick produces a single request
    vi.advanceTimersByTime(1500);
    httpMock
      .expectOne((r) => r.url === '/api/pipeline/runs')
      .flush([makeRun({ id: 2, status: 'started' }), makeRun({ id: 1, status: 'started' })]);
    httpMock.expectNone((r) => r.url === '/api/pipeline/runs');

    vi.advanceTimersByTime(1500);
    httpMock
      .expectOne((r) => r.url === '/api/pipeline/runs')
      .flush([makeRun({ id: 2, status: 'completed' }), makeRun({ id: 1, status: 'started' })]);
    httpMock.expectNone((r) => r.url === '/api/pipeline/runs');

    expect(store.triggering()).toBe(false);

    vi.advanceTimersByTime(200); // refresh$ debounce
    httpMock.expectOne((r) => r.url === '/api/drones/latest').flush(emptyPage);

    // run 1's abandoned poll never resumes
    vi.advanceTimersByTime(1500);
    httpMock.expectNone((r) => r.url === '/api/pipeline/runs');
  });

  it('toggleLatestOnly() refetches from the raw endpoint, then back from /latest', () => {
    store.toggleLatestOnly();
    expect(store.latestOnly()).toBe(false);

    vi.advanceTimersByTime(200); // refresh$ debounce
    httpMock.expectOne((r) => r.url === '/api/drones').flush(emptyPage);

    store.toggleLatestOnly();
    expect(store.latestOnly()).toBe(true);

    vi.advanceTimersByTime(200);
    httpMock.expectOne((r) => r.url === '/api/drones/latest').flush(emptyPage);
  });

  it('toggleLatestOnly() resets offset to 0 before refetching', () => {
    store.setPage(50);
    vi.advanceTimersByTime(200);
    httpMock.expectOne((r) => r.url === '/api/drones/latest' && r.params.get('offset') === '50').flush(emptyPage);

    store.toggleLatestOnly();
    expect(store.offset()).toBe(0);

    vi.advanceTimersByTime(200);
    httpMock.expectOne((r) => r.url === '/api/drones' && r.params.get('offset') === '0').flush(emptyPage);
  });
});
