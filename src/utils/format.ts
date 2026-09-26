export const percent = (value: number, decimals = 0): string => (value * 100).toFixed(decimals) + '%';
export const formatNumber = (value: number): string => new Intl.NumberFormat('en-US').format(value);
export const compactNumber = (value: number): string => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
