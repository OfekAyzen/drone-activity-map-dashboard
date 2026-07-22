import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { FilterChipComponent } from './filter-chip.component';

describe('FilterChipComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<FilterChipComponent>>;
  let component: FilterChipComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FilterChipComponent] });
    fixture = TestBed.createComponent(FilterChipComponent);
    component = fixture.componentInstance;
    component.label = 'Test';
    fixture.detectChanges();
  });

  it('toggles open state and emits opened only when opening, not closing', () => {
    let openedCount = 0;
    component.opened.subscribe(() => openedCount++);

    component.toggle();
    expect(component.open()).toBe(true);
    expect(openedCount).toBe(1);

    component.toggle();
    expect(component.open()).toBe(false);
    expect(openedCount).toBe(1);
  });

  it('closes when clicking outside the chip', () => {
    component.toggle();
    expect(component.open()).toBe(true);

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(component.open()).toBe(false);
    outside.remove();
  });

  it('does not close when clicking inside the chip', () => {
    component.toggle();
    fixture.nativeElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(component.open()).toBe(true);
  });

  it('closes on Escape', () => {
    component.toggle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(component.open()).toBe(false);
  });
});
