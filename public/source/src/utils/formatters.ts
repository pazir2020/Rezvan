/**
 * Utility functions for Persian formatting, currency, numbers and tabular data
 */

export function toPersianDigits(input: string | number | undefined | null): string {
  if (input === undefined || input === null) return '';
  const str = String(input);
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return str.replace(/[0-9]/g, (w) => persianDigits[parseInt(w, 10)]);
}

export function formatNumber(num: number | undefined | null, usePersian = false): string {
  if (num === undefined || num === null || isNaN(num)) return '۰';
  const formatted = Math.round(num).toLocaleString('fa-IR');
  return usePersian ? formatted : num.toLocaleString('en-US');
}

export function formatTomans(amount: number | undefined | null, showUnit = true): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '۰ تومان';
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = Math.round(abs).toLocaleString('fa-IR');
  const sign = isNegative ? '-' : '';
  return `${sign}${formatted}${showUnit ? ' تومان' : ''}`;
}

export function formatPercent(rate: number, decimals = 1): string {
  if (isNaN(rate)) return '۰٪';
  return `${rate.toFixed(decimals).replace('.', '/')}٪`;
}

export function formatHours(hours: number): string {
  return `${hours.toLocaleString('fa-IR')} ساعت`;
}

export function maskNationalId(nid: string): string {
  if (!nid || nid.length < 10) return nid;
  return `${nid.slice(0, 3)}****${nid.slice(7)}`;
}

export function maskBankAccount(acc: string): string {
  if (!acc || acc.length < 8) return acc;
  return `****${acc.slice(-4)}`;
}

export function maskSheba(sheba: string): string {
  if (!sheba || sheba.length < 10) return sheba;
  return `IR**-****-****-${sheba.slice(-4)}`;
}
