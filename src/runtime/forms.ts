// src/runtime/forms.ts
// Minimal forms layer built on the reactive state primitive (./state).
import { createState, registerDep } from './state';
import type { ReactiveState } from './state';

export type Validator = (
  value: unknown,
  values?: Record<string, unknown>,
) => string | null;

// Fails only on undefined, null, ''. false and 0 count as present.
export function required(msg = 'Required'): Validator {
  return (value: unknown): string | null =>
    value === undefined || value === null || value === '' ? msg : null;
}

// Non-strings fail (strings only).
export function minLength(n: number, msg?: string): Validator {
  const message = msg ?? `Minimum length is ${n}`;
  return (value: unknown): string | null => {
    if (typeof value !== 'string') return message;
    return value.length >= n ? null : message;
  };
}

export function maxLength(n: number, msg?: string): Validator {
  const message = msg ?? `Maximum length is ${n}`;
  return (value: unknown): string | null => {
    if (typeof value !== 'string') return message;
    return value.length <= n ? null : message;
  };
}

// Empty string passes (pair with required to reject it).
// All other non-strings fail.
export function pattern(re: RegExp, msg?: string): Validator {
  const message = msg ?? 'Invalid format';
  return (value: unknown): string | null => {
    if (value === '') return null;
    if (typeof value !== 'string') return message;
    return re.test(value) ? null : message;
  };
}

// Empty string passes (pair with required to reject it).
export function email(msg?: string): Validator {
  const message = msg ?? 'Invalid email';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return (value: unknown): string | null => {
    if (value === '') return null;
    if (typeof value !== 'string') return message;
    return re.test(value) ? null : message;
  };
}

// Strict: typeof number and not NaN. Numeric strings fail.
export function isNumber(msg?: string): Validator {
  const message = msg ?? 'Must be a number';
  return (value: unknown): string | null =>
    typeof value === 'number' && !Number.isNaN(value) ? null : message;
}

// Non-numbers (including NaN) fail.
export function min(n: number, msg?: string): Validator {
  const message = msg ?? `Minimum is ${n}`;
  return (value: unknown): string | null => {
    if (typeof value !== 'number' || Number.isNaN(value)) return message;
    return value >= n ? null : message;
  };
}

export function max(n: number, msg?: string): Validator {
  const message = msg ?? `Maximum is ${n}`;
  return (value: unknown): string | null => {
    if (typeof value !== 'number' || Number.isNaN(value)) return message;
    return value <= n ? null : message;
  };
}

export function oneOf(list: unknown[], msg?: string): Validator {
  const message = msg ?? `Must be one of: ${list.join(', ')}`;
  return (value: unknown): string | null =>
    list.includes(value) ? null : message;
}

// Passthrough for user-defined checks.
export function custom(
  fn: (v: unknown, values?: Record<string, unknown>) => string | null,
): Validator {
  return fn;
}

// Run every validator, collect non-null messages in order (no short-circuit).
export function validateField(
  value: unknown,
  validators: Validator[],
  values?: Record<string, unknown>,
): string[] {
  const messages: string[] = [];
  for (const run of validators) {
    const message = run(value, values);
    if (message !== null) messages.push(message);
  }
  return messages;
}

export type FieldDef = {
  initial?: unknown;
  validate?: Validator[];
};

function snapshotOf(values: ReactiveState, names: string[]): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const key of names) snap[key] = values[key] as unknown;
  return snap;
}

export function useForm(fields: Record<string, FieldDef>): {
  values: ReactiveState;
  errors: ReactiveState;
  touched: ReactiveState;
  setField(name: string, value: unknown): void;
  touch(name: string): void;
  validate(name?: string): boolean;
  validateAll(): boolean;
  reset(): void;
  isValid(): boolean;
} {
  const names = Object.keys(fields);
  const initials: Record<string, unknown> = {};
  for (const name of names) initials[name] = fields[name].initial;

  const valuesInit: Record<string, ReactiveState[string]> = {};
  const errorsInit: Record<string, ReactiveState[string]> = {};
  const touchedInit: Record<string, ReactiveState[string]> = {};
  for (const name of names) {
    valuesInit[name] = initials[name] as ReactiveState[string];
    errorsInit[name] = '';
    touchedInit[name] = false;
  }
  const values = createState(valuesInit);
  const errors = createState(errorsInit);
  const touched = createState(touchedInit);

  function runField(name: string): boolean {
    const def = fields[name];
    if (!def) return true;
    const list = def.validate ?? [];
    const messages = validateField(
      values[name] as unknown,
      list,
      snapshotOf(values, names),
    );
    errors[name] = messages.length > 0 ? messages[0] : '';
    return messages.length === 0;
  }

  function overall(): boolean {
    for (const name of names) {
      if ((errors[name] as unknown as string) !== '') return false;
    }
    return true;
  }

  return {
    values,
    errors,
    touched,

    setField(name: string, value: unknown): void {
      values[name] = value as ReactiveState[string];
      // Revalidate only once the field has been interacted with,
      // so untouched fields don't flash errors while typing elsewhere.
      if ((touched[name] as unknown as boolean) === true) runField(name);
    },

    touch(name: string): void {
      touched[name] = true;
      runField(name);
    },

    // validate(name) marks that field touched, validates it, and returns
    // that field's validity. validate() with no arg validates all fields
    // and returns the form's overall validity.
    validate(name?: string): boolean {
      if (name !== undefined) {
        touched[name] = true;
        return runField(name);
      }
      return this.validateAll();
    },

    validateAll(): boolean {
      let ok = true;
      for (const name of names) {
        touched[name] = true;
        if (!runField(name)) ok = false;
      }
      return ok;
    },

    reset(): void {
      for (const name of names) {
        values[name] = initials[name] as ReactiveState[string];
        errors[name] = '';
        touched[name] = false;
      }
    },

    // Pure read of current errors; does not run validators.
    // Call validateAll() first when a fresh verdict is needed.
    isValid(): boolean {
      return overall();
    },
  };
}

// Two-way binding between a form control and values[name].
// Text/textarea/single-select sync via el.value; checkboxes via checked.
// State -> element flows through registerDep; element -> state through an
// 'input' listener writing values[name] directly (Proxy set notifies deps).
// The returned unbind removes the 'input' listener. Note: the
// state -> element subscription cannot be removed (state.ts exposes no
// unregister), so unbind stops element -> state sync only.
export function bindModel(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  values: Record<string, unknown>,
  name: string,
): () => void {
  const isCheckbox = (el as HTMLInputElement).type === 'checkbox';

  function sync(): void {
    if (isCheckbox) {
      (el as HTMLInputElement).checked = Boolean(values[name]);
    } else {
      const current = values[name];
      el.value = current === undefined || current === null ? '' : String(current);
    }
  }

  sync();
  registerDep(values as ReactiveState, name, sync);

  function onInput(): void {
    if (isCheckbox) {
      values[name] = (el as HTMLInputElement).checked;
    } else {
      values[name] = el.value;
    }
  }
  el.addEventListener('input', onInput);

  return (): void => {
    el.removeEventListener('input', onInput);
  };
}
