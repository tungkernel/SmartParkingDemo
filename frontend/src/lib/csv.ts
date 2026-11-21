export function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  // Mitigate spreadsheet formula injection including leading whitespace, tabs, and CRs
  const safe = /^\s*[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportRowsToCsv(
  headers: string[],
  rows: Array<Array<unknown>>,
  filename: string,
): void {
  const lines = [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))];
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
