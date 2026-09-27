import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LayoutService } from '../../core/services/layout.service';

interface NavItem {
  path: string;
  label: string;
  icon: 'dashboard' | 'repairs' | 'agenda' | 'clients' | 'reports';
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  protected readonly layout = inject(LayoutService);
  private readonly auth = inject(AuthService);

  /** En escritorio el menú permanece contraído y solo se expande mientras el mouse (o el foco) está encima. */
  protected readonly expanded = signal(false);

  protected readonly navItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/arreglos', label: 'Arreglos', icon: 'repairs' },
    { path: '/agenda', label: 'Agenda', icon: 'agenda' },
    { path: '/clientes', label: 'Clientes', icon: 'clients' },
    { path: '/informes', label: 'Informes', icon: 'reports' },
  ];

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !(event.currentTarget as HTMLElement).contains(next)) this.expanded.set(false);
  }

  protected logout(): void {
    this.layout.closeMobileSidebar();
    this.auth.logout();
  }
}
