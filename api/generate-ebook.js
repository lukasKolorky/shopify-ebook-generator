// Import potřebných nástrojů
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const path = require('path');

// Nastavení API klíče pro SendGrid (načte se z bezpečného prostředí Vercelu)
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Hlavní funkce, kterou Vercel spustí
export default async function handler(req, res) {
  // Přijímáme jen POST požadavky
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. ZÍSKÁNÍ DAT Z OBJEDNÁVKY
    const order = req.body;
    const properties = order.line_items[0]?.properties;
    const nameProperty = properties?.find(p => p.name === 'Jméno pro knihu');
    
    if (!nameProperty) {
      console.log('Objednávka neobsahuje personalizované jméno.');
      return res.status(200).send('OK: No personalization needed.');
    }
    
    const customerName = nameProperty.value;
    const customerEmail = order.email;

    // 2. VYTVOŘENÍ PERSONALIZOVANÉHO HTML
    const htmlTemplate = fs.readFileSync(path.resolve('./template.html'), 'utf8');
    const finalHtml = htmlTemplate.replace('{{NAME}}', customerName);

    // 3. GENEROVÁNÍ PDF
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    
    const page = await browser.newPage();
    await page.setContent(finalHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();

    // 4. ODESLÁNÍ E-MAILU
    const msg = {
      to: customerEmail,
      from: 'lukas@kolorky.cz', // <-- ZMĚŇTE NA VÁŠ OVĚŘENÝ E-MAIL ZE SENDGRIDU
      subject: `Vaše personalizovaná E-kniha je připravena!`,
      text: `Dobrý den, děkujeme za vaši objednávku. V příloze naleznete svou osobní e-knihu pro ${customerName}.\n\nS pozdravem,\nVáš tým.`,
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: `e-kniha-pro-${customerName.replace(/ /g, "_")}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
    };
    
    await sgMail.send(msg);
    
    // 5. ODESLÁNÍ ODPOVĚDI DO SHOPIFY
    console.log(`PDF úspěšně odesláno na ${customerEmail}`);
    res.status(200).send('OK');

  } catch (error) {
    console.error('Došlo k chybě:', error);
    res.status(500).send('Internal Server Error');
  }
}