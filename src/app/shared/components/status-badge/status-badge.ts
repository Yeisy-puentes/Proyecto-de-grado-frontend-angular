import { Component, computed, input } from '@angular/core';
import { RepairStatus, STATUS_LABELS, statusClass } from '../../../core/models/repair.model';

@Component({
  selector: 'app-status-badge',
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.css',
})
export class StatusBadge {
  readonly status = input.required<RepairStatus>();

  protected readonly label = computed(() => STATUS_LABELS[this.status()]);
  protected readonly cssClass = computed(() => `badge badge--${statusClass(this.status())}`);
}
