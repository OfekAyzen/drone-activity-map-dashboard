import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';

@Component({
  selector: 'app-filter-chip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './filter-chip.component.html',
  styleUrl: './filter-chip.component.css',
})
export class FilterChipComponent {
  @Input({ required: true }) label!: string;
  @Input() active = false;
  @Output() opened = new EventEmitter<void>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly open = signal(false);

  toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.opened.emit();
  }

  close(): void {
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
