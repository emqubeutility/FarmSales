import type { ReactNode } from 'react';

// Line icons used across the app (24 x 24, drawn with the current colour).
export const iconPaths: Record<string, ReactNode> = {
  dashboard: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  pos: <><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H7" /><circle cx="9.5" cy="20" r="1.3" /><circle cx="17.5" cy="20" r="1.3" /></>,
  history: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  returns: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
  fulfilment: <path d="M1 6h13v10H1zM14 10h4l3 3v3h-7zM5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
  items: <path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" />,
  stock: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 18l9 5 9-5" />,
  batches: <path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4" />,
  receive: <path d="M12 3v12M7 10l5 5 5-5M4 19h16" />,
  suppliers: <path d="M3 5h18v14H3zM7 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM4 16c.5-2 2-3 3-3s2.5 1 3 3M14 9h5M14 13h5" />,
  customers: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7" />,
  reports: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  users: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  leaf: <path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 12-4 16-9 16zM4 20c3-4 6-7 10-9" />,
  store: <path d="M3 9l1.5-5h15L21 9M3 9h18v0M3 9v11h18V9M9 20v-6h6v6" />,
  tag: <path d="M3 12V3h9l9 9-9 9zM7.5 7.5h.01" />,
  grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  truck: <path d="M1 6h13v10H1zM14 10h4l3 3v3h-7zM5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
  percent: <path d="M19 5L5 19M6.5 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 20.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />,
  hash: <path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  mail: <path d="M4 5h16v14H4zM4 6l8 6 8-6" />,
  pin: <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  file: <path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6" />,
  card: <path d="M2 6h20v12H2zM2 10h20M6 15h4" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />,
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />,
  save: <path d="M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7" />,
  check: <path d="M5 12l5 5L20 7" />,
  calendar: <path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4" />,
  crown: <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  dots: <><circle cx="12" cy="5" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="19" r="1.5" fill="currentColor" /></>,
};

export function Icon({ name, size = 20, strokeWidth = 1.8 }: { name: string; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
      {iconPaths[name]}
    </svg>
  );
}
