import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, TemplateRef, computed, inject, input, model, signal } from '@angular/core';

export interface SelectOption<T> {
  value: T;
  label: string;
  /** Cantidad opcional que se muestra en un globo a la derecha ("Todos · 2676"). */
  count?: number;
}

let nextId = 0;

/**
 * Desplegable accesible (patrón combobox + listbox): el foco se queda en el botón y las
 * flechas mueven la opción activa (aria-activedescendant). Enter/Espacio elige, Escape cierra.
 * Se cierra también al tocar fuera o al elegir una opción.
 */
@Component({
  selector: 'app-select-dropdown',
  imports: [NgTemplateOutlet],
  templateUrl: './select-dropdown.html',
  styleUrl: './select-dropdown.css',
  host: { '(document:click)': 'onDocumentClick($event)' },
})
export class SelectDropdown<T> {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly options = input.required<SelectOption<T>[]>();
  readonly value = model.required<T>();
  readonly ariaLabel = input('Seleccionar');
  /** Plantilla opcional para un ícono antes de cada etiqueta (contexto: la opción). */
  readonly iconTemplate = input<TemplateRef<{ $implicit: SelectOption<T> }> | null>(null);

  protected readonly listId = `select-dropdown-${++nextId}`;
  protected readonly open = signal(false);
  /** Opción resaltada con el teclado o el mouse. */
  protected readonly activeIndex = signal(0);

  protected readonly selectedIndex = computed(() => Math.max(0, this.options().findIndex((o) => o.value === this.value())));
  protected readonly selected = computed(() => this.options()[this.selectedIndex()]);

  protected optionId(index: number): string {
    return `${this.listId}-opt-${index}`;
  }

  protected toggle(): void {
    if (this.open()) this.close();
    else this.show();
  }

  protected choose(index: number): void {
    const option = this.options()[index];
    if (option) this.value.set(option.value);
    this.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const last = this.options().length - 1;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!this.open()) return this.show();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.activeIndex.update((i) => Math.min(last, Math.max(0, i + step)));
        break;
      }
      case 'Home':
      case 'End':
        if (!this.open()) return;
        event.preventDefault();
        this.activeIndex.set(event.key === 'Home' ? 0 : last);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault(); // evita el click nativo del botón
        if (this.open()) this.choose(this.activeIndex());
        else this.show();
        break;
      case 'Escape':
        if (!this.open()) return;
        // Que no llegue a otros atajos de Escape de la página (p. ej. cerrar el panel lateral).
        event.preventDefault();
        event.stopPropagation();
        this.close();
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  private show(): void {
    this.activeIndex.set(this.selectedIndex());
    this.open.set(true);
  }

  private close(): void {
    this.open.set(false);
  }
}
