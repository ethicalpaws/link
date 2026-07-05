import { ref } from 'vue'

const toasts = ref([])
let id = 0

export function useToast() {
  function toast(msg, type) {
    const tid = ++id
    toasts.value.push({ id: tid, msg, type: type || 'info' })
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== tid)
    }, 2500)
  }
  return { toasts, toast }
}

// 供组件直接导入使用的单例
export const toast = (msg, type) => {
  const tid = ++id
  toasts.value.push({ id: tid, msg, type: type || 'info' })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== tid)
  }, 2500)
}
