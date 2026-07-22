import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, computed, signal } from '@angular/core';

import { DroneFilters, DroneStatus } from '../../../core/models';
import { FilterChipComponent } from './filter-chip.component';

interface StatusOption {
  value: DroneStatus | '';
  label: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: '', label: 'Any' },
  { value: 'active', label: 'Active' },
  { value: 'landed', label: 'Landed' },
  { value: 'lost_signal', label: 'Lost signal' },
];

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [CommonModule, FilterChipComponent],
  templateUrl: './filter-panel.component.html',
  styleUrl: './filter-panel.component.css',
})
export class FilterPanelComponent {
  @Output() apply = new EventEmitter<DroneFilters>();
  @Output() reset = new EventEmitter<void>();

  readonly statusOptions = STATUS_OPTIONS;

  readonly droneType = signal('');
  readonly operatorId = signal('');
  readonly minBattery = signal<number | null>(null);
  readonly status = signal<DroneStatus | ''>('');

  readonly appliedFrom = signal('');
  readonly appliedTo = signal('');
  readonly draftFrom = signal('');
  readonly draftTo = signal('');

  readonly droneTypeLabel = computed(() => (this.droneType() ? `Type: ${this.droneType()}` : 'Type: Any'));
  readonly operatorIdLabel = computed(() =>
    this.operatorId() ? `Operator: ${this.operatorId()}` : 'Operator: Any',
  );
  readonly minBatteryLabel = computed(() =>
    this.minBattery() != null ? `Battery: ≥${this.minBattery()}%` : 'Battery: Any',
  );
  readonly statusLabel = computed(() => {
    const current = this.statusOptions.find((option) => option.value === this.status());
    return `Status: ${current?.label ?? 'Any'}`;
  });
  readonly dateRangeActive = computed(() => !!this.appliedFrom() || !!this.appliedTo());
  readonly dateRangeLabel = computed(() => {
    if (!this.dateRangeActive()) return 'Date range: Any';
    const from = this.appliedFrom() ? this.formatDate(this.appliedFrom()) : '…';
    const to = this.appliedTo() ? this.formatDate(this.appliedTo()) : '…';
    return `${from} – ${to}`;
  });

  onDroneTypeInput(event: Event): void {
    this.droneType.set((event.target as HTMLInputElement).value);
  }

  applyDroneType(): void {
    const value = this.droneType().trim();
    this.droneType.set(value);
    this.apply.emit({ drone_type: value || undefined });
  }

  onOperatorIdInput(event: Event): void {
    this.operatorId.set((event.target as HTMLInputElement).value);
  }

  applyOperatorId(): void {
    const value = this.operatorId().trim();
    this.operatorId.set(value);
    this.apply.emit({ operator_id: value || undefined });
  }

  onMinBatteryInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.minBattery.set(raw === '' ? null : Number(raw));
  }

  applyMinBattery(): void {
    this.apply.emit({ min_battery: this.minBattery() ?? undefined });
  }

  selectStatus(value: DroneStatus | '', chip: FilterChipComponent): void {
    this.status.set(value);
    this.apply.emit({ status: value || undefined });
    chip.close();
  }

  resetDateDraft(): void {
    this.draftFrom.set(this.appliedFrom());
    this.draftTo.set(this.appliedTo());
  }

  onDraftFromInput(event: Event): void {
    this.draftFrom.set((event.target as HTMLInputElement).value);
  }

  onDraftToInput(event: Event): void {
    this.draftTo.set((event.target as HTMLInputElement).value);
  }

  applyDateRange(chip: FilterChipComponent): void {
    this.appliedFrom.set(this.draftFrom());
    this.appliedTo.set(this.draftTo());
    this.apply.emit({
      from: this.draftFrom() ? new Date(this.draftFrom()).toISOString() : undefined,
      to: this.draftTo() ? new Date(this.draftTo()).toISOString() : undefined,
    });
    chip.close();
  }

  clearDateRange(chip: FilterChipComponent): void {
    this.draftFrom.set('');
    this.draftTo.set('');
    this.appliedFrom.set('');
    this.appliedTo.set('');
    this.apply.emit({ from: undefined, to: undefined });
    chip.close();
  }

  onReset(): void {
    this.droneType.set('');
    this.operatorId.set('');
    this.minBattery.set(null);
    this.status.set('');
    this.appliedFrom.set('');
    this.appliedTo.set('');
    this.draftFrom.set('');
    this.draftTo.set('');
    this.reset.emit();
  }

  private formatDate(value: string): string {
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
