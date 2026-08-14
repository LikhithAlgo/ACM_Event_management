const USER_URL = import.meta.env.VITE_USER_URL || 'http://localhost:5173';
const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || 'http://localhost:5174';

export function getAppMode(): 'ADMIN' | 'USER' {
  const origin = window.location.origin.replace(/\/$/, '');
  const adminUrl = ADMIN_URL.replace(/\/$/, '');
  if (origin === adminUrl || window.location.port === '5174') {
    return 'ADMIN';
  }
  return 'USER';
}

export function redirectToHost(role: 'ADMIN' | 'PARTICIPANT', targetPath: string = ''): boolean {
  return false;
}
