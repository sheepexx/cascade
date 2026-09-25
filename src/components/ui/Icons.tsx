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

export function DiscordIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M18.59 5.88997C17.36 5.31997 16.05 4.89997 14.67 4.65997C14.5 4.95997 14.3 5.36997 14.17 5.69997C12.71 5.47997 11.26 5.47997 9.83001 5.69997C9.69001 5.36997 9.49001 4.95997 9.32001 4.65997C7.94001 4.89997 6.63001 5.31997 5.40001 5.88997C2.92001 9.62997 2.25001 13.28 2.58001 16.87C4.23001 18.1 5.82001 18.84 7.39001 19.33C7.78001 18.8 8.12001 18.23 8.42001 17.64C7.85001 17.43 7.31001 17.16 6.80001 16.85C6.94001 16.75 7.07001 16.64 7.20001 16.54C10.33 18 13.72 18 16.81 16.54C16.94 16.65 17.07 16.75 17.21 16.85C16.7 17.16 16.15 17.42 15.59 17.64C15.89 18.23 16.23 18.8 16.62 19.33C18.19 18.84 19.79 18.1 21.43 16.87C21.82 12.7 20.76 9.08997 18.61 5.88997H18.59ZM8.84001 14.67C7.90001 14.67 7.13001 13.8 7.13001 12.73C7.13001 11.66 7.88001 10.79 8.84001 10.79C9.80001 10.79 10.56 11.66 10.55 12.73C10.55 13.79 9.80001 14.67 8.84001 14.67ZM15.15 14.67C14.21 14.67 13.44 13.8 13.44 12.73C13.44 11.66 14.19 10.79 15.15 10.79C16.11 10.79 16.87 11.66 16.86 12.73C16.86 13.79 16.11 14.67 15.15 14.67Z" />
    </svg>
  );
}
