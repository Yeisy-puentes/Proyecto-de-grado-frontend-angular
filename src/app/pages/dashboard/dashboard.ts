import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Repair } from '../../core/models/repair.model';
import { RepairService } from '../../core/services/repair.service';
import { ToastService } from '../../core/services/toast.service';
import { fromDateKey, toDateKey, todayKey } from '../../core/utils/date.utils';
import { apiErrorMessage } from '../../core/utils/http-error';
import { Pagination, paginate } from '../../shared/components/pagination/pagination';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { Time12Pipe } from '../../shared/pipes/time12.pipe';

/** Grupos que se pueden ver en la tarjeta principal (se eligen con las tarjetas de arriba). */
type DeliveryGroup = 'hoy' | 'manana' | 'listos';

const GROUP_TITLES: Record<DeliveryGroup, { title: string; empty: string }> = {
  hoy: { title: 'Pendientes de hoy', empty: 'No hay arreglos pendientes para entregar hoy.' },
  manana: { title: 'Pendientes de mañana', empty: 'No hay arreglos pendientes para entregar mañana.' },
  listos: { title: 'Listos para recoger', empty: 'No hay arreglos listos esperando al cliente.' },
};

/**
 * Desde este ancho el dashboard ocupa justo el alto de la pantalla y la lista se desplaza por
 * dentro de su tarjeta; por debajo (celular / tableta, una sola columna) las listas se paginan.
 */
const COMPACT_QUERY = '(max-width: 1023px)';
const COMPACT_PAGE_SIZE = 5;

/** Por fecha de entrega y, dentro del mismo día, por hora (los que no tienen hora van al final). */
function byDelivery(a: Repair, b: Repair): number {
  return (
    (a.deliveryDate ?? '9999').localeCompare(b.deliveryDate ?? '9999') ||
    (a.deliveryTime ?? '99:99').localeCompare(b.deliveryTime ?? '99:99')
  );
}

/** Del más reciente al más antiguo por fecha y hora de entrega (los que no tienen fecha/hora van al final). */
function byDeliveryDesc(a: Repair, b: Repair): number {
  return (
    (b.deliveryDate ?? '').localeCompare(a.deliveryDate ?? '') ||
    (b.deliveryTime ?? '').localeCompare(a.deliveryTime ?? '')
  );
}

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, NgTemplateOutlet, Pagination, RouterLink, StatusBadge, Time12Pipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private readonly repairService = inject(RepairService);
  private readonly toast = inject(ToastService);

  protected readonly fromDateKey = fromDateKey;
  protected readonly loading = this.repairService.loading;

  protected readonly today = new Date();
  private readonly todayKey = todayKey();
  private readonly tomorrowKey = toDateKey(
    new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate() + 1),
  );

  /** Pantalla angosta: las listas se paginan en vez de desplazarse por dentro. */
  protected readonly compact = signal(false);
  protected readonly compactPageSize = COMPACT_PAGE_SIZE;
  protected readonly page = signal(1);
  protected readonly upcomingPage = signal(1);

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Solo en el navegador (matchMedia no existe en SSR).
    afterNextRender(() => {
      const mq = window.matchMedia(COMPACT_QUERY);
      const update = (): void => this.compact.set(mq.matches);
      update();
      mq.addEventListener('change', update);
      destroyRef.onDestroy(() => mq.removeEventListener('change', update));
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.repairService.load();
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'No se pudo cargar el dashboard'));
    }
  }

  /** Arreglos que aún no se han entregado, ordenados por fecha y hora de entrega. */
  private readonly notDelivered = computed(() =>
    this.repairService
      .repairs()
      .filter((r) => r.status !== 'entregado')
      .sort(byDelivery),
  );

  protected readonly groups = computed<Record<DeliveryGroup, Repair[]>>(() => {
    const list = this.notDelivered();
    return {
      // Hoy y mañana: solo los que siguen en estado Pendiente (sin empezar).
      hoy: list.filter((r) => r.status === 'pendiente' && r.deliveryDate === this.todayKey),
      manana: list.filter((r) => r.status === 'pendiente' && r.deliveryDate === this.tomorrowKey),
      // Listos: todos, del más reciente al más antiguo por fecha de entrega.
      listos: list.filter((r) => r.status === 'listo').sort(byDeliveryDesc),
    };
  });

  /** Grupo que muestra la tarjeta principal; cambia al hacer clic en las tarjetas de arriba. */
  protected readonly activeGroup = signal<DeliveryGroup>('hoy');

  protected selectGroup(group: DeliveryGroup): void {
    this.activeGroup.set(group);
    this.page.set(1);
  }

  protected readonly activeList = computed(() => {
    const group = this.activeGroup();
    return { group, ...GROUP_TITLES[group], items: this.groups()[group] };
  });

  /** En celular, solo la página actual; en pantallas grandes, toda la lista (con scroll interno). */
  protected readonly visibleItems = computed(() => {
    const items = this.activeList().items;
    return this.compact() ? paginate(items, this.page(), COMPACT_PAGE_SIZE) : items;
  });

  /** Próximas entregas: desde pasado mañana en adelante, por fecha y hora. */
  protected readonly upcomingDeliveries = computed(() =>
    this.notDelivered().filter((r) => r.deliveryDate && r.deliveryDate > this.tomorrowKey),
  );

  protected readonly visibleUpcoming = computed(() => {
    const items = this.upcomingDeliveries();
    return this.compact() ? paginate(items, this.upcomingPage(), COMPACT_PAGE_SIZE) : items;
  });
}
