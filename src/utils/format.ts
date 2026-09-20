export function formatTime(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '00:00.00';
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${pad(min)}:${pad(sec)}.${pad(cs)}`;
}

export function averageOf(arr: number[], n: number): number | null {
  if (arr.length < n) return null;
  const slice = arr.slice(-n);
  if (n >= 5) {
    // drop best and worst for ao5/ao12
    const sorted = [...slice].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, -1);
    return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  }
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}
