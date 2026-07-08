/**
 * useMarkdown — Markdown 解析 Composable
 *
 * 职责：marked 配置、HTML 消毒、解析缓存。
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';

// ============================================================
// marked 配置（模块级，仅执行一次）
// ============================================================
const renderer = new marked.Renderer();
renderer.code = function(arg: string | { text: string; lang?: string }) {
  const text = typeof arg === 'string' ? arg : arg.text;
  const lang = typeof arg === 'string' ? undefined : arg.lang;
  const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div class="code-block"${lang ? ` data-lang="${lang}"` : ''}>
  <div class="code-block__toolbar">
    <span class="code-block__lang">${lang || 'text'}</span>
    <button class="code-block__copy" data-code="${encodeURIComponent(text)}" title="复制代码">📋 复制</button>
  </div>
  <pre><code class="hljs${lang ? ` language-${lang}` : ''}">${escaped}</code></pre>
</div>`;
};
marked.use({ renderer, breaks: true, gfm: true });

// ============================================================
// 缓存
// ============================================================
const markdownCache = new Map<string, string>();

// ============================================================
// 高亮入口（供外部 MutationObserver 调用）
// ============================================================
export function highlightCodeBlocks(container: HTMLElement) {
  container.querySelectorAll('pre code:not(.hljs)').forEach(block => {
    hljs.highlightElement(block as HTMLElement);
  });
}

// ============================================================
// 暴露方法
// ============================================================
export function parseMarkdown(text: string): string {
  if (markdownCache.has(text)) return markdownCache.get(text)!;
  try {
    const rawHtml = marked.parse(text) as string;
    const sanitized = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
    if (markdownCache.size > 200) {
      // 超过 200 条时清除最早的 25%
      const keysToDelete = Array.from(markdownCache.keys()).slice(0, 50);
      keysToDelete.forEach(k => markdownCache.delete(k));
    }
    markdownCache.set(text, sanitized);
    return sanitized;
  } catch {
    return text;
  }
}
