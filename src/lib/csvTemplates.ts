// Shared CSV-template mechanics: given a column list and one sample row, produce a downloadable
// starter file matching the exact columns a domain's importer actually reads. Originally written
// once for Positions (see `positionTemplates.ts`); extracted here so every other upload path can
// offer the same "here's the format, filled in" starting point instead of a user inferring
// expected columns from documentation or trial and error.

function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvTemplateText(columns: string[], sampleRow: string[]): string {
  return [columns.map(escapeCsvField).join(','), sampleRow.map(escapeCsvField).join(',')].join('\n');
}

export function downloadCsvTemplate(columns: string[], sampleRow: string[], filename: string): void {
  const blob = new Blob([csvTemplateText(columns, sampleRow)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
