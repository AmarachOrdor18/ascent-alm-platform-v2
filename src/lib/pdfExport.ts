/**
 * Client-side PDF export for a generated report pack. No server round trip —
 * the figures are already in the browser (read from the run at generation
 * time), so the download just lays them out.
 *
 * Styled to the same brand tokens as the rest of the app (navy-900 / gold-500
 * from index.css), not jsPDF's black-on-white default — this is a document a
 * committee member forwards outside the platform, so it should read as an
 * Ecobank artifact rather than a generic export.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const NAVY: [number, number, number] = [9, 42, 52];
const GOLD: [number, number, number] = [189, 209, 36];
const GRAY: [number, number, number] = [131, 133, 140];

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
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Header band ──────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 26, pageWidth, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('ECOBANK', 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(220, 220, 220);
  doc.text('Asset & Liability Management Platform', 14, 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`${data.kindLabel.toUpperCase()} PACK`, pageWidth - 14, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(220, 220, 220);
  doc.text(data.status, pageWidth - 14, 18, { align: 'right' });

  // ── Title ────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(data.packName, 14, 38);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  const meta = [
    data.runAsOfDate ? `As of ${data.runAsOfDate}` : null,
    data.generatedAt ? `Generated ${data.generatedAt.slice(0, 10)}${data.generatedBy ? ` by ${data.generatedBy}` : ''}` : null,
    data.recipients.length > 0 ? `Distributed to ${data.recipients.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('   ·   ');
  doc.text(meta, 14, 45);

  autoTable(doc, {
    startY: 52,
    head: [['Section', 'Status', 'Value']],
    body: data.sections.map((s) => [s.title, s.status, s.value]),
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 248, 249] },
    styles: { fontSize: 10, cellPadding: 4, textColor: [30, 41, 51] },
    columnStyles: { 2: { halign: 'right', fontStyle: 'bold', textColor: NAVY } },
  });

  // ── Footer ───────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text('Figures read live from the source run at generation time. Ecobank ALM Platform.', 14, pageHeight - 10);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }

  const slug = data.packName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  doc.save(`${slug || 'report-pack'}.pdf`);
}
