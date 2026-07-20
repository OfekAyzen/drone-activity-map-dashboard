import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { PipelineRun } from '../../../core/models';

@Component({
  selector: 'app-pipeline-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pipeline-panel.component.html',
  styleUrl: './pipeline-panel.component.css',
})
export class PipelinePanelComponent {
  @Input() runs: PipelineRun[] = [];
  @Input() triggering = false;
  @Output() runPipeline = new EventEmitter<void>();

  formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleString() : '-';
  }
}
