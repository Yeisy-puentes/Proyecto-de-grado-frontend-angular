import { Injectable, signal } from '@angular/core';

/** Estado compartido entre sidebar y topbar (menú lateral). */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly sidebarCollapsed = signal(false);
  readonly mobileSidebarOpen = signal(false);

  toggleCollapsed(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  openMobileSidebar(): void {
    this.mobileSidebarOpen.set(true);
  }

  closeMobileSidebar(): void {
    this.mobileSidebarOpen.set(false);
  }
}
