/**
 * Client-side PDF export for a generated report pack. No server round trip —
 * the figures are already in the browser (read from the run at generation
 * time), so the download just lays them out.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PdfSectionRow {
  title: string;
  status: string;
  value: string;
}

export interface PdfPackData {
  packName: string;
  kindLabel: string;
  status: string;
  generatedAt: string | null;
  generatedBy: string | null;
  runAsOfDate: string | null;
  recipients: string[];
  sections: PdfSectionRow[];
}

export function exportPackPdf(data: PdfPackData): void {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.packName, 14, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  const meta = [
    `${data.kindLabel} pack · ${data.status}`,
    data.runAsOfDate ? `As of ${data.runAsOfDate}` : null,
    data.generatedAt ? `Generated ${data.generatedAt.slice(0, 10)}${data.generatedBy ? ` by ${data.generatedBy}` : ''}` : null,
    data.recipients.length > 0 ? `Distributed to ${data.recipients.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
  doc.text(meta, 14, 25);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 32,
    head: [['Section', 'Status', 'Value']],
    body: data.sections.map((s) => [s.title, s.status, s.value]),
    headStyles: { fillColor: [1, 24, 43] },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    'Figures read live from the source run at generation time. Ascent ALM Platform.',
    14,
    finalY + 10,
  );

  const slug = data.packName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  doc.save(`${slug || 'report-pack'}.pdf`);
}
