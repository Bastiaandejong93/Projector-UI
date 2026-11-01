export const systemItems = [
  { icon: 'settings', label: 'Settings', destination: 'settings' },
  { icon: 'wifi', label: 'Wi-Fi', destination: 'wifi' },
  { icon: 'input', label: 'Input', destination: 'inputs' },
  { icon: 'apps', label: 'All Apps', destination: 'all-apps' },
  { icon: 'spotify', label: 'Spotify Controls', destination: 'spotify-notifications' },
  { icon: 'dream', label: 'Luna Screensaver', destination: 'screensaver' },
  { icon: 'atmosphere', label: 'Atmosphere', destination: 'atmosphere' },
] as const;

const paths = {
  settings: '<path d="m9 3-.6 2.3-2 .9-2.1-.6-2 3.4 1.6 1.7-.2 2.3L2 14.7l2 3.5 2.3-.6 1.8 1.3.5 2.1h4.8l.6-2.3 2-.9 2.1.6 2-3.4-1.6-1.7.2-2.3 1.7-1.7-2-3.5-2.3.6-1.8-1.3L13.8 3Z"/><circle cx="11.5" cy="12" r="3"/>',
  wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="20" r=".7" fill="currentColor"/>',
  input: '<path d="M10 4h10v16H10M3 12h12m-4-4 4 4-4 4"/>',
  apps: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  spotify: '<circle cx="12" cy="12" r="9"/><path d="M7.5 10c3-1 6.1-.7 8.5.6M8.2 13c2.3-.7 4.7-.4 6.6.6M9 15.7c1.5-.4 3.1-.2 4.4.4"/>',
  dream: '<path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z"/><path d="M18 3v4m-2-2h4"/>',
  atmosphere: '<path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z"/><path d="M18 3v4m-2-2h4"/>',
  exit: '<path d="M9 4H4v16h5m5-12 4 4-4 4M8 12h12"/>',
} as const;

export function menuIcon(name: keyof typeof paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}
