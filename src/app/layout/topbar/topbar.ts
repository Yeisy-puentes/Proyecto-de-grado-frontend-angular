import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LayoutService } from '../../core/services/layout.service';
import { RepairService } from '../../core/services/repair.service';
import { todayKey } from '../../core/utils/date.utils';
import { CopCurrencyPipe } from '../../shared/pipes/cop-currency.pipe';
import { Time12Pipe } from '../../shared/pipes/time12.pipe';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';

@Component({
  selector: 'app-topbar',
  imports: [RouterLink, DatePipe, CopCurrencyPipe, Time12Pipe, StatusBadge],
  templateUrl: './topbar.html',
  styleUrl: './topbar.css',
})
export class Topbar {
  protected readonly layout = inject(LayoutService);
  protected readonly auth = inject(AuthService);
  private readonly repairService = inject(RepairService);

  protected readonly today = new Date();
  protected readonly notifOpen = signal(false);

  /** Arreglos con entrega hoy que aún no se han entregado. */
  protected readonly todayRepairs = computed(() => {
    const today = todayKey();
    return this.repairService.repairs().filter((r) => r.status !== 'entregado' && r.deliveryDate === today)
      .sort((a, b) => (a.deliveryTime ?? '').localeCompare(b.deliveryTime ?? ''));
  });

  protected toggleNotif(): void {
    this.notifOpen.update((open) => !open);
  }
}
