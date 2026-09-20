'use client';

/**
 * Persistent, clearly-visible on-device processing badge. Shown wherever
 * the camera is active. The lock icon and phrasing must accurately reflect
 * the system's behavior — if the architecture changes to cloud processing,
 * this component and the Privacy page must be updated together.
 */
export function PrivacyBadge({ className = '' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Privacy status: your camera is processed on this device only"
      className={`flex items-center gap-2 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-medium text-privacyOk shadow backdrop-blur-sm border border-privacyOk/30 ${className}`}
    >
      <svg
        className="h-3.5 w-3.5 shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
          clipRule="evenodd"
        />
      </svg>
      <span>Camera processed on this device — your image is never uploaded</span>
    </div>
  );
}
