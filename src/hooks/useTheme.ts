import { useEffect, useState } from 'react';
export type Theme = 'dark' | 'light';
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem('curamate.theme') === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#212121' : '#f8f9fa');
    try { localStorage.setItem('curamate.theme', theme); } catch { /* The preference is optional. */ }
  }, [theme]);
  return { theme, toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark') };
}
