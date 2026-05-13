import katex from "katex";

export function renderLatexToHtml(source: string, displayMode = false): string {
  return katex.renderToString(source.trim(), {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: false,
  });
}

export function renderLatexElement(element: HTMLElement, source: string): void {
  element.innerHTML = renderLatexToHtml(source);
}
