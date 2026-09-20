import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseToastReturn {
  message: string;
  toast: (text: string) => void;
  clearToast: () => void;
}

export function useToast(durationMs = 4500): UseToastReturn {
  const [message, setMessage] = useState<string>('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearToast = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setMessage('');
  }, []);

  const toast = useCallback((text: string) => {
    setMessage(text);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => {
      setMessage('');
      toastTimer.current = null;
    }, durationMs);
  }, [durationMs]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  return { message, toast, clearToast };
}
