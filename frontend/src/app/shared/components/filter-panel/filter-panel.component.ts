import { Component, EventEmitter, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import { DroneFilters } from '../../../core/models';

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './filter-panel.component.html',
  styleUrl: './filter-panel.component.css',
})
export class FilterPanelComponent {
  @Output() apply = new EventEmitter<DroneFilters>();
  @Output() reset = new EventEmitter<void>();

  private readonly fb = new FormBuilder();

  readonly form = this.fb.group({
    drone_type: [''],
    status: [''],
    operator_id: [''],
    min_battery: [null as number | null],
    from: [''],
    to: [''],
  });

  onApply(): void {
    const value = this.form.value;
    const filters: DroneFilters = {};

    if (value.drone_type) filters.drone_type = value.drone_type;
    if (value.status) filters.status = value.status as DroneFilters['status'];
    if (value.operator_id) filters.operator_id = value.operator_id;
    if (value.min_battery != null && value.min_battery !== ('' as unknown)) {
      filters.min_battery = Number(value.min_battery);
    }
    if (value.from) filters.from = new Date(value.from).toISOString();
    if (value.to) filters.to = new Date(value.to).toISOString();

    this.apply.emit(filters);
  }

  onReset(): void {
    this.form.reset({
      drone_type: '',
      status: '',
      operator_id: '',
      min_battery: null,
      from: '',
      to: '',
    });
    this.reset.emit();
  }
}
