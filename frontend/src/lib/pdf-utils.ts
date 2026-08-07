export async function urlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padEnd(6, '0');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ─── Indian number-to-words (for payslip "In Words" line) ────────────────────

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function twoDigits(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  if (n < 100) return twoDigits(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  return ONES[h] + ' hundred' + (r ? ' ' + twoDigits(r) : '');
}

export function numberToWords(amount: number): string {
  const n = Math.floor(amount);
  if (n === 0) return 'Zero only';

  let rem = n;
  const crores = Math.floor(rem / 10_000_000);
  rem %= 10_000_000;
  const lakhs = Math.floor(rem / 100_000);
  rem %= 100_000;
  const thousands = Math.floor(rem / 1_000);
  rem %= 1_000;

  const parts: string[] = [];
  if (crores) parts.push(threeDigits(crores) + ' crore');
  if (lakhs) parts.push(twoDigits(lakhs) + ' lakh');
  if (thousands) parts.push(twoDigits(thousands) + ' thousand');
  if (rem) parts.push(threeDigits(rem));

  const raw = parts.join(' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1) + ' only';
}
