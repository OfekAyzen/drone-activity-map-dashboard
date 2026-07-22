import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { DashboardStore } from '../../core/state/dashboard.store';
import { DroneFilters } from '../../core/models';
import { FilterPanelComponent } from '../../shared/components/filter-panel/filter-panel.component';
import { MapComponent } from '../../shared/components/map/map.component';
import { PipelinePanelComponent } from '../../shared/components/pipeline-panel/pipeline-panel.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FilterPanelComponent, MapComponent, PipelinePanelComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  readonly store = inject(DashboardStore);

  onApplyFilters(patch: DroneFilters): void {
    this.store.patchFilters(patch);
  }

  onResetFilters(): void {
    this.store.resetFilters();
  }

  onDroneSelected(droneId: string): void {
    this.store.selectDrone(droneId);
  }

  onPrevPage(): void {
    const newOffset = Math.max(0, this.store.offset() - this.store.limit());
    this.store.setPage(newOffset);
  }

  onNextPage(): void {
    const newOffset = this.store.offset() + this.store.limit();
    if (newOffset < this.store.total()) {
      this.store.setPage(newOffset);
    }
  }
}
