import { ref } from 'vue';

export type ToastType = 'info' | 'error' | 'success';

export function useToast() {
  const toastMessage = ref<{ text: string; type: ToastType } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(text: string, type: ToastType = 'info', duration = 2500) {
    if (toastTimer) clearTimeout(toastTimer);
    toastMessage.value = { text, type };
    toastTimer = setTimeout(() => {
      toastMessage.value = null;
      toastTimer = null;
    }, duration);
  }

  return {
    toastMessage,
    showToast,
  };
}
