import { Component, input, output } from '@angular/core';

/** Buscador con lupa a la izquierda y botón ✕ para limpiar (mismo diseño que el de Clientes). */
@Component({
  selector: 'app-search-box',
  templateUrl: './search-box.html',
  styleUrl: './search-box.css',
})
export class SearchBox {
  readonly value = input('');
  readonly placeholder = input('Buscar...');
  readonly valueChange = output<string>();
}
