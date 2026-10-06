import { Component, inject, signal } from '@angular/core';
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
}
