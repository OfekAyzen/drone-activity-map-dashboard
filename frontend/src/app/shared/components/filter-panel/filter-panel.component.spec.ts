import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DroneFilters } from '../../../core/models';
import { FilterChipComponent } from './filter-chip.component';
import { FilterPanelComponent } from './filter-panel.component';

function fakeChip(): FilterChipComponent {
  return { close: vi.fn() } as unknown as FilterChipComponent;
}

describe('FilterPanelComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<FilterPanelComponent>>;
  let component: FilterPanelComponent;
  let emitted: DroneFilters[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FilterPanelComponent] });
    fixture = TestBed.createComponent(FilterPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    emitted = [];
    component.apply.subscribe((value) => emitted.push(value));
  });

  it('applyDroneType emits the trimmed value', () => {
    component.droneType.set('  Quadcopter  ');
    component.applyDroneType();

    expect(emitted).toEqual([{ drone_type: 'Quadcopter' }]);
  });

  it('applyDroneType emits undefined once the field is cleared', () => {
    component.droneType.set('');
    component.applyDroneType();

    expect(emitted).toEqual([{ drone_type: undefined }]);
  });

  it('applyOperatorId emits the trimmed value', () => {
    component.operatorId.set('OP-123');
    component.applyOperatorId();

    expect(emitted).toEqual([{ operator_id: 'OP-123' }]);
  });

  it('applyMinBattery emits the numeric value', () => {
    component.minBattery.set(50);
    component.applyMinBattery();

    expect(emitted).toEqual([{ min_battery: 50 }]);
  });

  it('selectStatus emits the chosen status and closes the chip', () => {
    const chip = fakeChip();
    component.selectStatus('active', chip);

    expect(emitted).toEqual([{ status: 'active' }]);
    expect(chip.close).toHaveBeenCalledOnce();
    expect(component.status()).toBe('active');
  });

  it('selectStatus with the "Any" option emits status: undefined', () => {
    const chip = fakeChip();
    component.selectStatus('', chip);

    expect(emitted).toEqual([{ status: undefined }]);
  });

  it('applyDateRange converts both drafts to ISO strings, commits them, and closes the chip', () => {
    const chip = fakeChip();
    component.draftFrom.set('2026-06-01T00:00');
    component.draftTo.set('2026-06-28T00:00');

    component.applyDateRange(chip);

    expect(emitted).toEqual([
      {
        from: new Date('2026-06-01T00:00').toISOString(),
        to: new Date('2026-06-28T00:00').toISOString(),
      },
    ]);
    expect(component.appliedFrom()).toBe('2026-06-01T00:00');
    expect(chip.close).toHaveBeenCalledOnce();
  });

  it('editing the date range draft does not emit anything until Apply is clicked', () => {
    component.draftFrom.set('2026-06-01T00:00');
    component.draftTo.set('2026-06-28T00:00');

    expect(emitted).toEqual([]);
  });

  it('clearDateRange resets both fields, emits undefined for both, and closes the chip', () => {
    const applyChip = fakeChip();
    component.draftFrom.set('2026-06-01T00:00');
    component.draftTo.set('2026-06-28T00:00');
    component.applyDateRange(applyChip);

    const clearChip = fakeChip();
    component.clearDateRange(clearChip);

    expect(emitted[1]).toEqual({ from: undefined, to: undefined });
    expect(component.appliedFrom()).toBe('');
    expect(component.dateRangeActive()).toBe(false);
    expect(clearChip.close).toHaveBeenCalledOnce();
  });

  it('resetDateDraft copies the last applied values back into the draft', () => {
    const chip = fakeChip();
    component.draftFrom.set('2026-06-01T00:00');
    component.draftTo.set('2026-06-28T00:00');
    component.applyDateRange(chip);

    component.draftFrom.set('garbage-unsaved-edit');
    component.resetDateDraft();

    expect(component.draftFrom()).toBe('2026-06-01T00:00');
    expect(component.draftTo()).toBe('2026-06-28T00:00');
  });

  it('onReset clears every field and emits reset', () => {
    let resetEmitted = false;
    component.reset.subscribe(() => (resetEmitted = true));

    component.droneType.set('Quadcopter');
    component.status.set('active');
    component.minBattery.set(50);
    component.appliedFrom.set('2026-06-01T00:00');

    component.onReset();

    expect(component.droneType()).toBe('');
    expect(component.status()).toBe('');
    expect(component.minBattery()).toBeNull();
    expect(component.appliedFrom()).toBe('');
    expect(resetEmitted).toBe(true);
  });
});
