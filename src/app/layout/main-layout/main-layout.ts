import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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

  ngOnInit(): void {
    // Los arreglos alimentan las notificaciones "Arreglos de hoy" del topbar.
    this.repairService.load().catch((err) => this.toast.error(apiErrorMessage(err, 'No se pudieron cargar los arreglos')));
  }
}
