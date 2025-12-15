import * as React from "react";

export type Serializer<T> = {
  parse: (raw: string) => T;
  stringify: (value: T) => string;
};

function createJsonSerializer<T>(): Serializer<T> {
  return {
    parse: (raw: string) => JSON.parse(raw) as T,
    stringify: (value: T) => JSON.stringify(value),
  };
}

export function usePersistedState<T>(
  key: string,
  initialValue: T,
  serializer: Serializer<T> = createJsonSerializer<T>()
) {
  const [state, setState] = React.useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initialValue : serializer.parse(raw);
    } catch {
      return initialValue;
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(key, serializer.stringify(state));
    } catch {
      // ignore (quota / private mode / etc.)
    }
  }, [key, state, serializer]);

  return [state, setState] as const;
}