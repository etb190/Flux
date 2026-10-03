/* ── Inline SVG icons (Material paths, same as the vanilla UI) ─────────── */

export function SearchIcon({ size = 18, className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
    </svg>
  );
}

export function GearIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
    </svg>
  );
}

export function BackIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

export function PlayIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

export function PauseIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

export function VolumeIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12z" />
    </svg>
  );
}

export function MuteIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21.5 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.3 8.3 0 0 0 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

export function SwitchIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 17V9z" />
    </svg>
  );
}

export function FullscreenIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}

export function CCIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1z" />
    </svg>
  );
}

export function RefreshIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  );
}

export function HomeIcon({ size = 19 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
}

export function EyeIcon({ size = 19 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 17 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 17 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 17 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
    </svg>
  );
}

export function PlusIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
    </svg>
  );
}

export function CheckIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

export function ThumbUpIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M1 21h4V9H1v12zM23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
    </svg>
  );
}

/* Server / mirrors icon (Stitch sources section) */
export function DnsIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M19 15v4H5v-4h14m1-2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1zM7 18.5A1.5 1.5 0 1 1 7 15.5a1.5 1.5 0 0 1 0 3zm12-9.5v4H5V9h14m1-2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM7 8.5A1.5 1.5 0 1 1 7 5.5a1.5 1.5 0 0 1 0 3zM19 3v4H5V3h14m1-2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM7 5.5A1.5 1.5 0 1 1 7 2.5a1.5 1.5 0 0 1 0 3z" />
    </svg>
  );
}

export function BoltIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z" />
    </svg>
  );
}

export function CloudIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95A5.469 5.469 0 0 1 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3z" />
    </svg>
  );
}

export function LinkIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
    </svg>
  );
}

export function FilmIcon({ size = 28 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M18 4v1h-2V4c0-.55-.45-1-1-1H9c-.55 0-1 .45-1 1v1H6V4c0-.55-.45-1-1-1s-1 .45-1 1v16c0 .55.45 1 1 1s1-.45 1-1v-1h2v1c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-1h2v1c0 .55.45 1 1 1s1-.45 1-1V4c0-.55-.45-1-1-1s-1 .45-1 1zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z" />
    </svg>
  );
}

/* Want-to-watch (bookmark ribbon) */
export function BookmarkIcon({ size = 19 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15-5-2.18L7 18V5h10v13z" />
    </svg>
  );
}

/* Material "explore" compass — the Discover tab */
export function DiscoverIcon({ size = 19 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z" />
    </svg>
  );
}

/* ── Custom window controls (frameless title bar, Netflix-dark chrome) ── */

export function WinMinimizeIcon({ size = 14 }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
      <path stroke="currentColor" strokeWidth="1.2" d="M1.5 6h9" />
    </svg>
  );
}

export function WinMaximizeIcon({ size = 14 }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
      <rect x="1.8" y="1.8" width="8.4" height="8.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function WinRestoreIcon({ size = 14 }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
      <rect x="1.8" y="3.8" width="6.4" height="6.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path fill="none" stroke="currentColor" strokeWidth="1.2" d="M4 1.8h6.2v6.2" />
    </svg>
  );
}

export function WinCloseIcon({ size = 14 }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
      <path stroke="currentColor" strokeWidth="1.2" d="m1.8 1.8 8.4 8.4M10.2 1.8 1.8 10.2" />
    </svg>
  );
}
