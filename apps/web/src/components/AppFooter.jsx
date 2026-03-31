'use client';

/** Shown on login, setup, admin shell, POS, and bundled installer splash. */
export const DEVELOPER_EMAIL = 'scarvin460@gmail.com';
export const APP_LEGAL_NAME = 'Dreamnet Media Tech';

export default function AppFooter({ className = '' }) {
  const year = new Date().getFullYear();
  return (
    <footer
      className={`text-center text-xs text-gray-500 dark:text-gray-400 ${className}`.trim()}
    >
      <p className="mb-1">
        © {year} {APP_LEGAL_NAME}
      </p>
      <p>
        Contact developer:{' '}
        <a className="text-gray-700 underline hover:text-gray-900 dark:text-gray-300" href={`mailto:${DEVELOPER_EMAIL}`}>
          {DEVELOPER_EMAIL}
        </a>
      </p>
    </footer>
  );
}
