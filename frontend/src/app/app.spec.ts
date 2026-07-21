import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';

describe('App', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('creates the app and renders the dashboard', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    vi.advanceTimersByTime(200); // DashboardStore debounces its initial refresh by 200ms

    httpMock.expectOne((r) => r.url === '/api/drones/latest').flush({ items: [], total: 0, limit: 50, offset: 0 });
    httpMock.expectOne((r) => r.url === '/api/pipeline/runs').flush([]);

    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-dashboard')).toBeTruthy();
  });
});
