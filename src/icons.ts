const paths: Record<string, string> = {
  circle: '<circle cx="12" cy="12" r="7"/>',
  square: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  triangle: '<path d="M12 4 20 18H4Z"/>',
  diamond: '<path d="M12 3 21 12l-9 9-9-9Z"/>',
  color: '<path d="M12 3a9 9 0 0 0 0 18h1a2.5 2.5 0 0 0 0-5h-1a2.5 2.5 0 0 1 0-5h5a5 5 0 0 0-5-8Z"/>',
  shape: '<rect x="4" y="4" width="8" height="8" rx="2"/><path d="M16 4l4 8h-8ZM8 20v-8h8"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  spark: '<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8Z"/>',
  play: '<path d="M8 5v14l11-7Z"/>',
  reset: '<path d="M4 4v6h6"/><path d="M5.5 10A8 8 0 1 1 4 15"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  cross: '<path d="M7 7l10 10M17 7 7 17"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v.1M12 11v6"/>',
  flower: '<path d="M12 21v-8m0 5 5-2M12 6c-5-8-10 2-4 4-8 4 0 10 4 4 4 6 12 0 4-4 6-2 1-12-4-4Z"/>',
};

export function icon(name: string, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}
