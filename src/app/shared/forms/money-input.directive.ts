import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** 50000 -> '50.000' (separador de miles colombiano). */
function formatThousands(value: number | null): string {
  return value === null ? '' : value.toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

/**
 * Campo de dinero para ngModel: muestra el valor con punto de miles mientras se escribe
 * ("50.000") y entrega al modelo el número limpio (50000), o null si está vacío.
 * Uso: <input type="text" appMoneyInput [(ngModel)]="form.cost" />
 */
@Directive({
  selector: 'input[appMoneyInput]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInput), multi: true }],
  host: {
    inputmode: 'numeric',
    autocomplete: 'off',
    '(input)': 'onInput()',
    '(blur)': 'onTouched()',
  },
})
export class MoneyInput implements ControlValueAccessor {
  private readonly input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private onChange: (value: number | null) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: number | string | null): void {
    const n = value === null || value === undefined || value === '' ? null : Number(value);
    // 0 se muestra vacío (con el placeholder "0") para que no haya que borrarlo antes de escribir.
    this.input.value = formatThousands(n && Number.isFinite(n) ? n : null);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.input.disabled = disabled;
  }

  protected onInput(): void {
    const el = this.input;
    // Cuántos dígitos hay antes del cursor, para dejarlo en el mismo lugar después de poner los puntos.
    const caret = el.selectionStart ?? el.value.length;
    const digitsBeforeCaret = el.value.slice(0, caret).replace(/\D/g, '').length;

    const digits = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const value = digits ? Number(digits) : null;
    el.value = formatThousands(value);

    let pos = 0;
    for (let seen = 0; pos < el.value.length && seen < digitsBeforeCaret; pos++) {
      if (/\d/.test(el.value[pos])) seen++;
    }
    el.setSelectionRange(pos, pos);

    this.onChange(value);
  }
}
