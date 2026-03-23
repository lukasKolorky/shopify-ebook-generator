import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { Resend } from 'resend';
import fs from 'fs/promises';
import path from 'path';

export default async function handler(req, res) {
  // --- TEST HRUBOU SILOU ---
  // Vložte svůj klíč z Resendu přímo mezi uvozovky:
  const backupKey = "re_LkJauAaH_FeBU1aazJ463eL3y3oPasaxg"; 
  
  // Zkusíme použít buď klíč ze systému, nebo tenhle náhradní
  const finalKey = process.env.RESEND_API_KEY || backupKey;

  if (!finalKey) {
    return res.status(500).json({ error: "Klíč stále nebyl nalezen ani v kódu!" });
  }

  const resend = new Resend(finalKey);

export default async function handler(req, res) {
  // 1. NEJPRVE zkontrolujeme, jestli Vercel klíč vidí (Záchranná brzda)
  if (!process.env.RESEND_API_KEY) {
    console.error("KRITICKÁ CHYBA: Vercel stále nepředal kód RESEND_API_KEY do funkce!");
    return res.status(500).json({ error: "Missing API key in environment variables." });
  }

  // 2. AŽ POTOM inicializujeme pošťáka (Bezpečně uvnitř funkce)
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const order = req.body;
    
    const properties = order.line_items[0]?.properties;
    const nameProperty = properties?.find(p => p.name === 'Jméno pro knihu');

    if (!nameProperty) {
      console.log('Objednávka neobsahuje personalizaci.');
      return res.status(200).send('OK: No personalization needed.');
    }

    const customerName = nameProperty.value;
    const customerEmail = order.email;

    // --- TVORBA PDF ---
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const imagePath = path.join(process.cwd(), 'api', 'shutterstock_1933690058_b39fcde5-79da-4594-a523-401def16514e.jpg');
    const fontPath = path.join(process.cwd(), 'api', 'OpenSans-Bold.ttf');

    const imageBytes = await fs.readFile(imagePath);
    const fontBytes = await fs.readFile(fontPath);

    const backgroundImage = await pdfDoc.embedJpg(imageBytes);
    const customFont = await pdfDoc.embedFont(fontBytes);

    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    
    page.drawImage(backgroundImage, { x: 0, y: 0, width, height });

    const textSize = 50;
    const textWidth = customFont.widthOfTextAtSize(customerName, textSize);
    
    page.drawText(customerName, {
      x: (width - textWidth) / 2,
      y: height / 2,
      font: customFont,
      size: textSize,
      color: rgb(1, 1, 1),
    });
    
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // --- ODESLÁNÍ E-MAILU PŘES RESEND ---
    const { data, error } = await resend.emails.send({
      from: 'Acme <onboarding@resend.dev>', 
      to: [customerEmail], // Nezapomeňte při testu zadat svůj e-mail z Resendu!
      subject: 'Vaše personalizovaná E-kniha je připravena!',
      text: `Dobrý den, v příloze naleznete svou osobní e-knihu pro jméno: ${customerName}.`,
      attachments: [{
        content: pdfBuffer,
        filename: `e-kniha-pro-${customerName.replace(/ /g, "_")}.pdf`,
      }],
    });

    if (error) {
      console.error('Chyba při odesílání přes Resend:', error);
      return res.status(500).json({ error });
    }
    
    console.log(`PDF úspěšně odesláno na ${customerEmail} (Jméno: ${customerName})`);
    res.status(200).send('OK');

  } catch (error) {
    console.error('Došlo k závažné chybě v procesu:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
}