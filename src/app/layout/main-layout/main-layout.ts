import { Component, ElementRef, OnInit, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { LayoutService } from '../../core/services/layout.service';
import { RepairService } from '../../core/services/repair.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../core/utils/http-error';
import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

/** Estructura común de las páginas internas: sidebar + topbar + contenido. */
@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, Sidebar, Topbar],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout implements OnInit {
  protected readonly layout = inject(LayoutService);
  private readonly repairService = inject(RepairService);
  private readonly toast = inject(ToastService);
  private readonly pageContent = viewChild<ElementRef<HTMLElement>>('pageContent');

  constructor() {
    // Al cambiar de pantalla (no solo de query params, p. ej. ?pagina=), la nueva empieza arriba:
    // el contenedor con scroll es el mismo para todas las páginas y si no conservaría la posición anterior.
    let lastPath = '';
    inject(Router)
      .events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        if (lastPath && path !== lastPath) this.pageContent()?.nativeElement.scrollTo({ top: 0 });
        lastPath = path;
      });
  }

  ngOnInit(): void {
    // Los arreglos alimentan las notificaciones "Arreglos de hoy" del topbar.
    this.repairService.load().catch((err) => this.toast.error(apiErrorMessage(err, 'No se pudieron cargar los arreglos')));
  }
}
