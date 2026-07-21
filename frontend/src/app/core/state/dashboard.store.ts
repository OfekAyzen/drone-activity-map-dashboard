import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Subject, debounceTime, filter, interval, switchMap, take } from 'rxjs';

import { DroneService } from '../services/drone.service';
import { PipelineService } from '../services/pipeline.service';
import { DroneFilters, DroneRecord, PipelineRun } from '../models';

function dedupeLatestPerDrone(records: DroneRecord[]): DroneRecord[] {
  const latestByDrone = new Map<string, DroneRecord>();
  for (const record of records) {
    const current = latestByDrone.get(record.drone_id);
    if (!current || new Date(record.timestamp) > new Date(current.timestamp)) {
      latestByDrone.set(record.drone_id, record);
    }
  }
  return Array.from(latestByDrone.values());
}

@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly droneService = inject(DroneService);
  private readonly pipelineService = inject(PipelineService);
  private readonly destroyRef = inject(DestroyRef);

  readonly filters = signal<DroneFilters>({});
  readonly limit = signal(50);
  readonly offset = signal(0);
  readonly items = signal<DroneRecord[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly latestOnly = signal(true);

  readonly runs = signal<PipelineRun[]>([]);
  readonly runsLoading = signal(false);
  readonly triggering = signal(false);

  readonly selectedDroneId = signal<string | null>(null);
  readonly pathPoints = signal<DroneRecord[]>([]);

  readonly visibleItems = computed(() =>
    this.latestOnly() ? dedupeLatestPerDrone(this.items()) : this.items(),
  );

  private readonly refresh$ = new Subject<void>();
  private readonly pollTrigger$ = new Subject<number>();

  constructor() {
    this.refresh$
      .pipe(
        debounceTime(200),
        switchMap(() => {
          this.loading.set(true);
          this.error.set(null);
          return this.droneService.list(this.filters(), this.limit(), this.offset());
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.items.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: (err: Error) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      });

    // switchMap cancels the previous run's poll loop the moment a new run is
    // triggered, so a burst of clicks leaves at most one interval(1500) alive.
    this.pollTrigger$
      .pipe(
        switchMap((runId) =>
          interval(1500).pipe(
            switchMap(() => this.pipelineService.listRuns()),
            filter((runs) => runs.some((run) => run.id === runId && run.status !== 'started')),
            take(1),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((runs) => {
        this.runs.set(runs);
        this.triggering.set(false);
        this.refresh$.next();
      });

    this.refresh$.next();
    this.refreshRuns();
  }

  patchFilters(patch: Partial<DroneFilters>): void {
    this.filters.update((current) => ({ ...current, ...patch }));
    this.offset.set(0);
    this.refresh$.next();
  }

  resetFilters(): void {
    this.filters.set({});
    this.offset.set(0);
    this.refresh$.next();
  }

  setPage(offset: number): void {
    this.offset.set(offset);
    this.refresh$.next();
  }

  toggleLatestOnly(): void {
    this.latestOnly.update((value) => !value);
  }

  refreshRuns(): void {
    this.runsLoading.set(true);
    this.pipelineService.listRuns().subscribe({
      next: (runs) => {
        this.runs.set(runs);
        this.runsLoading.set(false);
      },
      error: () => this.runsLoading.set(false),
    });
  }

  runPipeline(source?: string): void {
    this.triggering.set(true);
    this.pipelineService.run(source).subscribe({
      next: (run) => {
        if (run.status === 'started') {
          this.runs.update((current) => [run, ...current.filter((r) => r.id !== run.id)]);
          this.pollTrigger$.next(run.id);
        } else {
          this.triggering.set(false);
          this.refresh$.next();
          this.refreshRuns();
        }
      },
      error: (err: Error) => {
        this.triggering.set(false);
        this.error.set(err.message);
      },
    });
  }

  selectDrone(droneId: string): void {
    this.selectedDroneId.set(droneId);
    this.droneService.history(droneId).subscribe({
      next: (page) => {
        const sorted = [...page.items].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        this.pathPoints.set(sorted);
      },
      error: (err: Error) => this.error.set(err.message),
    });
  }

  clearSelection(): void {
    this.selectedDroneId.set(null);
    this.pathPoints.set([]);
  }
}
