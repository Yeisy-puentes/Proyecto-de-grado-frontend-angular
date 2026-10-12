import { Component, inject } from '@angular/core';
import { ToastService, ToastType } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.html',
  styleUrl: './toast.css',
})
export class ToastContainer {
  protected readonly toastService = inject(ToastService);

  protected readonly titles: Record<ToastType, string> = {
    success: 'Listo',
    error: 'Error',
    info: 'Aviso',
  };
}
