import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiRecordatorio, ApiRecordatorioInput } from '../models/api.model';
import { Reminder, mapReminder } from '../models/reminder.model';
import { DateRange } from './report.service';

/** Recordatorios de la agenda: consume /api/recordatorios. */
@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/recordatorios`;

  private readonly remindersState = signal<Reminder[]>([]);
  readonly reminders = this.remindersState.asReadonly();

  async load(range: DateRange = {}): Promise<void> {
    let params = new HttpParams();
    if (range.desde) params = params.set('desde', range.desde);
    if (range.hasta) params = params.set('hasta', range.hasta);
    const rows = await firstValueFrom(this.http.get<ApiRecordatorio[]>(this.url, { params }));
    this.remindersState.set(rows.map(mapReminder));
  }

  async create(data: Omit<Reminder, 'id'>): Promise<Reminder> {
    const body: ApiRecordatorioInput = {
      titulo: data.title.trim(),
      descripcion: data.description?.trim() || null,
      fecha: data.date,
      hora: data.time,
      color: data.color,
    };
    const reminder = mapReminder(await firstValueFrom(this.http.post<ApiRecordatorio>(this.url, body)));
    this.remindersState.update((list) => [...list, reminder]);
    return reminder;
  }

  async delete(id: number): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.url}/${id}`));
    this.remindersState.update((list) => list.filter((r) => r.id !== id));
  }
}
