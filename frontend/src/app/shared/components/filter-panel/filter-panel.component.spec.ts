import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { FilterPanelComponent } from './filter-panel.component';

describe('FilterPanelComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<FilterPanelComponent>>;
  let component: FilterPanelComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FilterPanelComponent] });
    fixture = TestBed.createComponent(FilterPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('emits only the populated fields on apply', () => {
    let emitted: unknown;
    component.apply.subscribe((value) => (emitted = value));

    component.form.patchValue({ drone_type: 'Quadcopter', status: 'active', min_battery: 50 });
    component.onApply();

    expect(emitted).toEqual({
      drone_type: 'Quadcopter',
      status: 'active',
      min_battery: 50,
    });
  });

  it('emits nothing set when the form is empty', () => {
    let emitted: unknown;
    component.apply.subscribe((value) => (emitted = value));

    component.onApply();

    expect(emitted).toEqual({});
  });

  it('resets the form and emits reset', () => {
    let resetEmitted = false;
    component.reset.subscribe(() => (resetEmitted = true));

    component.form.patchValue({ drone_type: 'Quadcopter' });
    component.onReset();

    expect(component.form.value.drone_type).toBe('');
    expect(resetEmitted).toBe(true);
  });

  it('converts from/to datetime-local values to ISO strings', () => {
    let emitted: { from?: string; to?: string } = {};
    component.apply.subscribe((value) => (emitted = value));

    component.form.patchValue({ from: '2026-06-01T00:00', to: '2026-06-28T00:00' });
    component.onApply();

    expect(emitted.from).toBe(new Date('2026-06-01T00:00').toISOString());
    expect(emitted.to).toBe(new Date('2026-06-28T00:00').toISOString());
  });
});
