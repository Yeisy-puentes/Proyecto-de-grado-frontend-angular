import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiLoginResponse, ApiUsuario } from '../models/api.model';

const TOKEN_KEY = 'interfajas.token';
const USER_KEY = 'interfajas.usuario';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly tokenState = signal<string | null>(this.read(TOKEN_KEY));
  private readonly userState = signal<ApiUsuario | null>(this.readUser());

  readonly token = this.tokenState.asReadonly();
  readonly user = this.userState.asReadonly();
  readonly userInitial = computed(() => this.userState()?.nombre_completo.charAt(0).toUpperCase() ?? '?');

  async login(correo: string, contrasena: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<ApiLoginResponse>(`${environment.apiUrl}/auth/login`, { correo, contrasena }),
    );
    this.tokenState.set(res.token);
    this.userState.set(res.usuario);
    this.write(TOKEN_KEY, res.token);
    this.write(USER_KEY, JSON.stringify(res.usuario));
  }

  logout(): void {
    this.tokenState.set(null);
    this.userState.set(null);
    this.remove(TOKEN_KEY);
    this.remove(USER_KEY);
    this.router.navigate(['/login']);
  }

  /** Hay token y no ha expirado (se lee el campo `exp` del JWT). */
  isAuthenticated(): boolean {
    const token = this.tokenState();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return !payload.exp || payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  // ---------- localStorage (solo en el navegador) ----------
  private read(key: string): string | null {
    if (!this.isBrowser) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private readUser(): ApiUsuario | null {
    const raw = this.read(USER_KEY);
    try {
      return raw ? (JSON.parse(raw) as ApiUsuario) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      /* almacenamiento no disponible: la sesión dura lo que dure la pestaña */
    }
  }

  private remove(key: string): void {
    if (!this.isBrowser) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignorar */
    }
  }
}
