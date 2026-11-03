// 인라인 SVG 아이콘 (외부 아이콘 폰트·CDN 없이)
const svg = (body, { fill = false } = {}) => `<svg class="ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;

export const IC = {
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
  doc: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
  checkSquare: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>'),
  chart: svg('<path d="M5 20V10M12 20V4M19 20v-7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  chevL: svg('<path d="m15 6-6 6 6 6"/>'),
  chevR: svg('<path d="m9 6 6 6-6 6"/>'),
  chevD: svg('<path d="m6 9 6 6 6-6"/>'),
  clipboard: svg('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  alertCircle: svg('<circle cx="12" cy="12" r="10"/><path d="M12 7v6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.4" fill="#fff"/>', { fill: true }),
  checkCircle: svg('<circle cx="12" cy="12" r="10"/><path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>', { fill: true }),
  clockCircle: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'),
  playCircle: svg('<circle cx="12" cy="12" r="10"/><path d="M10 8.5v7l6-3.5z" fill="#fff"/>', { fill: true }),
  bangCircle: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16v.5"/>'),
  warn: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="#fff"/>', { fill: true }),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  pause: svg('<circle cx="12" cy="12" r="10"/><path d="M10 8.5v7M14 8.5v7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>', { fill: true }),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
  star: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>', { fill: true }),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>'),
  arrowR: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
};

// 표시 상태별 아이콘
export const STATUS_IC = {
  done: IC.checkCircle, doing: IC.playCircle, notstarted: IC.bangCircle, planned: IC.clockCircle, overdue: IC.alertCircle,
};
