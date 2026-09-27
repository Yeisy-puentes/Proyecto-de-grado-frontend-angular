import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
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

  private readonly router = inject(Router);

  /** Nombre de la sección actual, tomado del título de la ruta ("Arreglos · Interfajas" -> "Arreglos"). */
  protected readonly sectionTitle = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => this.currentRouteTitle()),
    ),
    { initialValue: '' },
  );

  private currentRouteTitle(): string {
    let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    let title = '';
    while (route) {
      if (route.title) title = route.title;
      route = route.firstChild;
    }
    return title.split(' · ')[0];
  }

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
