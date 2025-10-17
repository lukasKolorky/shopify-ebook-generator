import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sgMail from '@sendgrid/mail';
import fs from 'fs/promises';
import path from 'path';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export default async function handler(req, res) {
  // === ZAČÁTEK DIAGNOSTICKÉ ČÁSTI ===
  try {
    const rootFiles = await fs.readdir(process.cwd());
    console.log('[DIAGNOSTIKA] Soubory v hlavním adresáři funkce:', rootFiles);
  } catch (e) {
    console.log('[DIAGNOSTIKA] Nemohu přečíst hlavní adresář:', e.message);
  }
  // === KONEC DIAGNOSTICKÉ ČÁSTI ===

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const order = req.body;
    // ... zbytek kódu zůstává naprosto stejný ...
    const properties = order.line_items[0]?.properties;
    const nameProperty = properties?.find(p => p.name === 'Jméno pro knihu');

    if (!nameProperty) {
      console.log('Objednávka neobsahuje personalizaci.');
      return res.status(200).send('OK: No personalization needed.');
    }

    const customerName = nameProperty.value;
    const customerEmail = order.email;

    // --- TVORBA PDF POMOCÍ PDF-LIB ---
    const pdfDoc = await PDFDocument.create();
    const imageBytes = await fs.readFile(path.resolve(process.cwd(), 'public/background.png'));
    const backgroundImage = await pdfDoc.embedPng(imageBytes);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    
    page.drawImage(backgroundImage, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    });

    const textSize = 50;
    const textWidth = font.widthOfTextAtSize(customerName, textSize);
    
    page.drawText(customerName, {
      x: (width - textWidth) / 2,
      y: height / 2,
      font: font,
      size: textSize,
      color: rgb(1, 1, 1),
    });
    
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // --- ODESLÁNÍ E-MAILU ---
    const msg = {
      to: customerEmail,
      from: 'info@kolorky.cz', // ZMĚŇTE NA VÁŠ OVĚŘENÝ E-MAIL
      subject: `Vaše personalizovaná E-kniha je připravena!`,
      text: `Dobrý den, v příloze naleznete svou osobní e-knihu pro ${customerName}.`,
      attachments: [{
        content: pdfBuffer.toString('base64'),
        filename: `e-kniha-pro-${customerName.replace(/ /g, "_")}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment',
      }],
    };
    
    await sgMail.send(msg);
    
    console.log(`PDF úspěšně odesláno na ${customerEmail}`);
    res.status(200).send('OK');

  } catch (error) {
    console.error('Došlo k závažné chybě v procesu:', error);
    res.status(500).send('Internal Server Error');
  }
}