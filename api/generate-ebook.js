import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import sgMail from '@sendgrid/mail';
import fs from 'fs/promises';
import path from 'path';

// Nastavení SendGrid API klíče z prostředí Vercelu
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export default async function handler(req, res) {
  // Povolíme pouze POST požadavky (ty posílá Shopify Webhook)
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const order = req.body;
    
    // Získání jména z vlastností produktu v Shopify
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
    
    // REGISTRACE FONTKITU (Opraveno: voláme na instanci pdfDoc)
    pdfDoc.registerFontkit(fontkit);

    // Načtení obrázku pozadí
    const imagePath = path.resolve(__dirname, 'shutterstock_1933690058_b39fcde5-79da-4594-a523-401def16514e.jpg');
    const imageBytes = await fs.readFile(imagePath);
    const backgroundImage = await pdfDoc.embedJpg(imageBytes);
    
    // Načtení VLASTNÍHO písma pro podporu češtiny
    const fontPath = path.resolve(__dirname, 'OpenSans-Bold.ttf');
    const fontBytes = await fs.readFile(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    // Vytvoření stránky (A4 rozměry v bodech)
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    
    // Vykreslení pozadí přes celou stránku
    page.drawImage(backgroundImage, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    });

    // Nastavení textu
    const textSize = 50;
    const textWidth = customFont.widthOfTextAtSize(customerName, textSize);
    
    // Vykreslení personalizovaného jména na střed
    page.drawText(customerName, {
      x: (width - textWidth) / 2,
      y: height / 2,
      font: customFont,
      size: textSize,
      color: rgb(1, 1, 1), // Bílá barva
    });
    
    // Uložení PDF do bufferu
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // --- ODESLÁNÍ E-MAILU PŘES SENDGRID ---
    const msg = {
      to: customerEmail,
      from: 'info@kolorky.cz', // Musí být ověřený odesílatel v SendGridu
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
    
    console.log(`PDF úspěšně odesláno na ${customerEmail} (Jméno: ${customerName})`);
    res.status(200).send('OK');

  } catch (error) {
    console.error('Došlo k závažné chybě v procesu:', error);
    res.status(500).send('Internal Server Error');
  }
}