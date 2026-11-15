import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { PURCHASE_AGREEMENT_INTRO, purchaseAgreementItems, formatShekels } from '../constants';

// The built-in PDF fonts (Helvetica) have no ₪ glyph, so Noto Sans is embedded
// (SIL Open Font License, see assets/fonts/OFL.txt). Resolved from the working
// directory like the other server paths (server/ in dev, /app in the container).
const FONT_DIR = path.resolve(process.cwd(), 'assets', 'fonts');

function registerFonts(doc: PDFKit.PDFDocument): { regular: string; bold: string } {
  const regular = path.join(FONT_DIR, 'NotoSans-Regular.ttf');
  const bold = path.join(FONT_DIR, 'NotoSans-Bold.ttf');
  if (!fs.existsSync(regular) || !fs.existsSync(bold)) {
    console.warn(`[agreementPdf] fonts not found in ${FONT_DIR}; falling back to Helvetica (no ₪ glyph).`);
    return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
  }
  doc.registerFont('Body', regular);
  doc.registerFont('Body-Bold', bold);
  disableLigatures(doc);
  return { regular: 'Body', bold: 'Body-Bold' };
}

// Noto Sans draws "fi"/"fl" as single ligature glyphs, which lose letters when
// text is searched or copied out of the PDF ("confirm" -> "confrm"). Turn
// ligatures off for every text call on this document, drawing and measuring
// alike (the font engine accepts a { feature: boolean } map).
function disableLigatures(doc: PDFKit.PDFDocument) {
  const features = { liga: false };
  const methods = doc as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of ['text', 'heightOfString', 'widthOfString']) {
    const original = methods[name].bind(doc);
    methods[name] = (str: unknown, ...args: unknown[]) => {
      const last = args[args.length - 1];
      if (last && typeof last === 'object') {
        if (!('features' in last)) args[args.length - 1] = { ...last, features };
      } else {
        args.push({ features });
      }
      return original(str, ...args);
    };
  }
}

export interface AgreementPdfData {
  employeeName: string;
  modelName: string;
  serialNumber?: string | null;
  price?: number | null;
  dateReceived: Date;
  fullName: string;
  idNumber?: string | null;
  signatureDataUrl?: string | null;
  adminName?: string | null;
  agreementVersion?: string | null;
  recordId: string;
}

const NAVY = '#0e1b2a';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const PANEL = '#f8fafc';
const EMERALD_INK = '#047857';
const EMERALD_BG = '#ecfdf5';

// Renders the signed purchase agreement (mirroring the on-screen handover record)
// as a PDF buffer, suitable for attaching to the completion email.
export function renderAgreementPdf(data: AgreementPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const fonts = registerFonts(doc);
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const left = 48;
    const right = pageWidth - 48;
    const contentWidth = right - left;

    // Brand bar.
    doc.rect(0, 0, pageWidth, 90).fill(NAVY);
    doc
      .fillColor('#ffffff')
      .font(fonts.bold)
      .fontSize(18)
      .text('Laptop Purchase Agreement', left, 26);
    doc
      .fillColor('#9fb2c6')
      .font(fonts.regular)
      .fontSize(10)
      .text('Laptop Resale · Signed handover record', left, 52);
    // "Handover complete" pill.
    const pillText = 'Handover complete';
    doc.font(fonts.bold).fontSize(10);
    const pillW = doc.widthOfString(pillText) + 24;
    doc.roundedRect(right - pillW, 34, pillW, 22, 11).fill(EMERALD_BG);
    doc.fillColor(EMERALD_INK).text(pillText, right - pillW + 12, 40);

    let y = 118;

    const sectionTitle = (label: string) => {
      doc.fillColor(INK).font(fonts.bold).fontSize(12).text(label, left, y);
      y += 20;
    };
    const row = (label: string, value: string, labelW = 150) => {
      doc.fillColor(MUTED).font(fonts.regular).fontSize(11).text(label, left, y, { width: labelW });
      doc
        .fillColor(INK)
        .font(fonts.bold)
        .fontSize(11)
        .text(value, left + labelW, y, { width: contentWidth - labelW });
      y += 18;
    };

    // Acceptance details.
    sectionTitle('Acceptance details');
    row('Employee', data.employeeName);
    row('Laptop model', data.modelName);
    row('Serial number', data.serialNumber || '—');
    row('Price', formatShekels(data.price));
    row(
      'Date received',
      data.dateReceived.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    );
    y += 12;

    // Purchase agreement.
    sectionTitle('Purchase agreement');
    const items = purchaseAgreementItems(data.price);
    const boxTop = y;
    doc.font(fonts.regular).fontSize(10.5);
    // Measure the panel height first.
    let measureY = boxTop + 14;
    const introH = doc.heightOfString(PURCHASE_AGREEMENT_INTRO, { width: contentWidth - 32 });
    measureY += introH + 6;
    for (const item of items) {
      measureY += doc.heightOfString(item, { width: contentWidth - 44 }) + 5;
    }
    const boxH = measureY - boxTop + 8;
    doc.roundedRect(left, boxTop, contentWidth, boxH, 8).fill(PANEL).stroke(LINE);

    let ty = boxTop + 14;
    doc.fillColor(INK).font(fonts.bold).fontSize(10.5).text(PURCHASE_AGREEMENT_INTRO, left + 16, ty, {
      width: contentWidth - 32,
    });
    ty += introH + 6;
    doc.font(fonts.regular).fillColor('#334155').fontSize(10.5);
    for (const item of items) {
      const h = doc.heightOfString(item, { width: contentWidth - 44 });
      doc.circle(left + 20, ty + 6, 1.6).fill('#334155');
      doc.fillColor('#334155').text(item, left + 28, ty, { width: contentWidth - 44 });
      ty += h + 5;
    }
    y = boxTop + boxH + 16;

    // Signed banner.
    doc.font(fonts.regular).fontSize(10.5);
    const bannerText = `Signed by ${data.fullName} on ${data.dateReceived.toLocaleString('en-GB')}.`;
    const bannerH = doc.heightOfString(bannerText, { width: contentWidth - 24 }) + 18;
    doc.roundedRect(left, y, contentWidth, bannerH, 8).fill(EMERALD_BG).stroke('#a7f3d0');
    doc.fillColor(EMERALD_INK).text(bannerText, left + 12, y + 9, { width: contentWidth - 24 });
    y += bannerH + 16;

    // Full name / ID.
    row('Full Name', data.fullName, 120);
    row('ID Number', data.idNumber || '—', 120);
    y += 8;

    // Signature.
    doc.fillColor(MUTED).font(fonts.bold).fontSize(10).text('Signature', left, y);
    y += 16;
    const sig = decodeDataUrlImage(data.signatureDataUrl);
    if (sig) {
      const sigBoxW = 260;
      const sigBoxH = 96;
      doc.roundedRect(left, y, sigBoxW, sigBoxH, 8).fill('#ffffff').stroke(LINE);
      try {
        doc.image(sig, left + 10, y + 8, { fit: [sigBoxW - 20, sigBoxH - 16] });
      } catch {
        doc.fillColor(MUTED).font(fonts.regular).fontSize(10).text('(signature on file)', left + 12, y + 40);
      }
      y += sigBoxH + 18;
    } else {
      doc.fillColor(MUTED).font(fonts.regular).fontSize(10).text('(signature on file)', left, y);
      y += 24;
    }

    // Divider + confirmations.
    doc.moveTo(left, y).lineTo(right, y).strokeColor(LINE).stroke();
    y += 18;
    sectionTitle('Confirmations');
    row('Handover Admin', data.adminName || '—', 120);

    // Footer.
    const footerY = doc.page.height - 54;
    doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor(LINE).stroke();
    doc
      .fillColor(MUTED)
      .font(fonts.regular)
      .fontSize(9)
      .text(`Agreement version ${data.agreementVersion || '1.0'}`, left, footerY + 10);
    doc.text(`Record ID: ${data.recordId}`, left, footerY + 10, { width: contentWidth, align: 'right' });

    doc.end();
  });
}

function decodeDataUrlImage(dataUrl?: string | null): Buffer | null {
  if (!dataUrl) return null;
  const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
}
