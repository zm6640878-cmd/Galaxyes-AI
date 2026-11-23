export function GlaxyesLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#0F172A" />
      <path
        d="M16 6.5L24.5 11.5V20.5L16 25.5L7.5 20.5V11.5L16 6.5Z"
        stroke="#3B82F6"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M16 11.5L20.5 14.1V19.3L16 21.9L11.5 19.3V14.1L16 11.5Z"
        fill="#2563EB"
      />
      <circle cx="16" cy="16.7" r="1.6" fill="#FFFFFF" />
    </svg>
  );
}
