import { Component, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FieldError } from '../../shared/forms/field-error/field-error';
import { FormValidation } from '../../shared/forms/form-validation.directive';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/utils/http-error';

@Component({
  selector: 'app-login',
  imports: [FormsModule, FieldError, FormValidation],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly currentYear = new Date().getFullYear();
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  /** Muestra u oculta la contraseña (cambia el type del input entre password y text). */
  protected readonly showPassword = signal(false);
  protected credentials = { email: '', password: '' };

  /** 'reset' cuando se entra por el enlace del correo (ruta /restablecer-contrasena). */
  readonly mode = input<'login' | 'reset'>('login');
  /** ?token=... del enlace de recuperación. */
  readonly token = input<string>();

  /** Qué muestra la tarjeta: iniciar sesión, pedir enlace, enlace enviado, nueva contraseña o listo. */
  protected readonly view = linkedSignal<'login' | 'forgot' | 'forgot-sent' | 'reset' | 'reset-done'>(() =>
    this.mode() === 'reset' ? 'reset' : 'login',
  );
  protected forgotEmail = '';
  protected reset = { password: '', confirm: '' };

  protected async onSubmit(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      await this.auth.login(this.credentials.email.trim(), this.credentials.password);
      await this.router.navigate(['/dashboard']);
    } catch (err) {
      this.errorMessage.set(apiErrorMessage(err, 'No se pudo iniciar sesión'));
    } finally {
      this.loading.set(false);
    }
  }

  protected openForgot(): void {
    // Si ya escribió su correo en el login, se reutiliza.
    this.forgotEmail = this.forgotEmail || this.credentials.email.trim();
    this.errorMessage.set('');
    this.view.set('forgot');
  }

  protected backToLogin(): void {
    this.errorMessage.set('');
    this.showPassword.set(false);
    // Desde /restablecer-contrasena se vuelve a /login (sin el token en la URL).
    if (this.mode() === 'reset') this.router.navigate(['/login']);
    else this.view.set('login');
  }

  protected async onForgotSubmit(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      await this.auth.requestPasswordReset(this.forgotEmail.trim());
      this.view.set('forgot-sent');
    } catch (err) {
      this.errorMessage.set(apiErrorMessage(err, 'No se pudo enviar el enlace'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async onResetSubmit(): Promise<void> {
    if (this.reset.password !== this.reset.confirm) {
      this.errorMessage.set('Las contraseñas no coinciden.');
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      await this.auth.resetPassword(this.token() ?? '', this.reset.password);
      this.reset = { password: '', confirm: '' };
      this.view.set('reset-done');
    } catch (err) {
      this.errorMessage.set(apiErrorMessage(err, 'No se pudo cambiar la contraseña'));
    } finally {
      this.loading.set(false);
    }
  }
}
