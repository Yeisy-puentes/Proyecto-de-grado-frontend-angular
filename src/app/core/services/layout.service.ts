import { Injectable, signal } from '@angular/core';

/** Estado compartido entre sidebar y topbar (menú lateral). */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly mobileSidebarOpen = signal(false);

  openMobileSidebar(): void {
    this.mobileSidebarOpen.set(true);
  }

  closeMobileSidebar(): void {
    this.mobileSidebarOpen.set(false);
  }
}
