type IconProps = { className?: string };

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M6 6L18 18M18 6L6 18"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M6 9L12 15L18 9"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function UndoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M9 8H14.5A4.5 4.5 0 0119 12.5V13a4.5 4.5 0 01-4.5 4.5H10M9 8L12 5M9 8L12 11"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function RedoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M15 8H9.5A4.5 4.5 0 005 12.5V13a4.5 4.5 0 004.5 4.5H14M15 8L12 5M15 8L12 11"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function DesktopIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M4 5.5h16a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-9a1 1 0 011-1zM8.5 20.5h7M12 16.5v4"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function MusicNoteIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M9 18V6.4a1 1 0 01.76-.97l7-1.75A1 1 0 0118 4.65V15"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx={6.5} cy={18} r={2.5} stroke="currentColor" strokeWidth={2} fill="none" />
      <circle cx={15.5} cy={15} r={2.5} stroke="currentColor" strokeWidth={2} fill="none" />
    </svg>
  );
}

export function BookmarkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M7 4h10a1 1 0 011 1v15l-6-4-6 4V5a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx={12} cy={8.5} r={3.5} stroke="currentColor" strokeWidth={2} fill="none" />
      <path
        d="M5 20a7 7 0 0114 0"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function MailIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zM3.5 7.5L12 13l8.5-5.5"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M10.3 4.9a2 2 0 013.4 0l7.3 12.6A2 2 0 0119.3 20H4.7a2 2 0 01-1.7-2.5l7.3-12.6zM12 9.5v4M12 16.8v.01"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function ErrorIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={2} fill="none" />
      <path
        d="M9 9l6 6M15 9l-6 6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
