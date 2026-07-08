import { ref } from 'vue';

export const themeOptions = [
  { value: '', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'midnight', label: '夜间护眼' },
  { value: 'smoky-blue', label: '雾霾蓝' },
  { value: 'mint', label: '薄荷绿' },
  { value: 'rose', label: '玫瑰红' },
  { value: 'amber', label: '琥珀橙' },
  { value: 'lavender', label: '薰衣草紫' },
  { value: 'glacier', label: '冰川蓝' },
  { value: 'chocolate', label: '巧克力' },
  { value: 'clean', label: '极简纯白' },
  { value: 'cyber', label: '赛博朋克' },
];

export function useTheme() {
  const currentTheme = ref('');
  const autoTheme = ref(false);

  function setTheme(theme: string) {
    if (autoTheme.value && theme !== 'auto') {
      autoTheme.value = false;
      localStorage.setItem('chat-auto-theme', 'false');
    }
    currentTheme.value = theme;
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('chat-theme', theme);
  }

  function toggleAutoTheme() {
    autoTheme.value = !autoTheme.value;
    localStorage.setItem('chat-auto-theme', String(autoTheme.value));
    if (autoTheme.value) {
      applySystemTheme();
    } else {
      const saved = localStorage.getItem('chat-theme') || '';
      setTheme(saved);
    }
  }

  function applySystemTheme() {
    if (!autoTheme.value) return;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const sysTheme = prefersDark ? 'dark' : '';
    currentTheme.value = sysTheme;
    if (sysTheme) {
      document.documentElement.setAttribute('data-theme', sysTheme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function initTheme() {
    autoTheme.value = localStorage.getItem('chat-auto-theme') === 'true';
    const savedTheme = localStorage.getItem('chat-theme') || '';
    if (!autoTheme.value) {
      setTheme(savedTheme);
    } else {
      currentTheme.value = savedTheme;
      applySystemTheme();
    }

    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      if (autoTheme.value) applySystemTheme();
    });
  }

  return {
    currentTheme,
    autoTheme,
    setTheme,
    toggleAutoTheme,
    initTheme,
  };
}
