type IconProps = { className?: string };

const base = "none";

export function HomeIcon({ className }: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.6" className={className}>
      <path d="M4 11l8-6 8 6v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function OverviewIcon({ className }: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.6" className={className}>
      <path d="M4 19V5" />
      <path d="M9 19v-7" />
      <path d="M14 19V9" />
      <path d="M19 19v-4" />
    </svg>
  );
}

export function DocumentsIcon({ className }: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.6" className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

export function CounterpartiesIcon({ className }: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.6" className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <circle cx="17" cy="9.5" r="2.6" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M14.5 14.5c2.3 0.2 4 2 4 4.5" />
    </svg>
  );
}

export function GapsIcon({ className }: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.6" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function ReadinessIcon({ className }: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className={className}>
      <path d="M4.5 17a7.5 7.5 0 0 1 15 0" />
      <path d="m12 13 3.5-3.5" />
      <path d="M7 17h10" />
    </svg>
  );
}

export function AppsIcon({ className }: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.6" className={className}>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <circle cx="16.5" cy="16.5" r="3.5" />
    </svg>
  );
}

export function ReviewerIcon({ className }: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.6" className={className}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.6" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.6" className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="3" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function BackArrowIcon({ className }: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.75" className={className}>
      <path d="M15 18 9 12l6-6" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="3" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.6" className={className}>
      <path d="M12 3v12" />
      <path d="m17 8-5-5-5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.4" className={className}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.4" className={className}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />
    </svg>
  );
}

export function LogOutIcon({ className }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.4" className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.8" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.2" className={className}>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

export function KeyIcon({ className }: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2.2" className={className} aria-hidden="true">
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15 19 4M18 5l2 2M15 8l2 2" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7l1-3h4l1 3" />
    </svg>
  );
}

export function GoogleLogo({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className}>
      <path fill="#4285F4" d="M22 12.2c0-.7-.06-1.4-.18-2H12v3.9h5.6c-.24 1.3-1 2.4-2.1 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.6z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.4-2.6c-.9.6-2 1-3.3 1-2.5 0-4.6-1.7-5.4-4H2.9v2.7C4.6 19.9 8 22 12 22z" />
      <path fill="#FBBC05" d="M6.6 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.3H2.9C2.3 8.6 2 10.3 2 12s.3 3.4.9 4.7z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.7.5 3.7 1.4l3-3C16.9 2.5 14.7 1.6 12 1.6c-4 0-7.4 2.1-9.1 5.7l3.7 2.7C7.4 7.7 9.5 6 12 6z" />
    </svg>
  );
}
