const { google } = require('googleapis');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const order = req.body;
    const properties = order.line_items[0]?.properties;
    const nameProperty = properties?.find(p => p.name === 'Jméno pro knihu');

    if (!nameProperty) {
      console.log('Objednávka neobsahuje personalizované jméno.');
      return res.status(200).send('OK: No personalization needed.');
    }

    const customerName = nameProperty.value;
    const customerEmail = order.email;
    const templateId = process.env.GOOGLE_DOC_TEMPLATE_ID;

    // 1. Připojení k Google API pomocí klíčů z Vercelu
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/documents',
      ],
    });
    const drive = google.drive({ version: 'v3', auth });
    const docs = google.docs({ version: 'v1', auth });

    // 2. Vytvoření kopie šablony
    const newDocName = `E-kniha pro ${customerName}`;
    const copiedFile = await drive.files.copy({
      fileId: templateId,
      requestBody: { name: newDocName },
    });
    const newDocId = copiedFile.data.id;

    // 3. Nahrazení jména v kopii
    await docs.documents.batchUpdate({
      documentId: newDocId,
      requestBody: {
        requests: [{
          replaceAllText: {
            containsText: { text: '{{jmeno}}', matchCase: true },
            replaceText: customerName,
          },
        }],
      },
    });

    // 4. Export do PDF
    const pdfResponse = await drive.files.export({
      fileId: newDocId,
      mimeType: 'application/pdf',
    }, { responseType: 'arraybuffer' });
    const pdfBuffer = Buffer.from(pdfResponse.data);

    // 5. Smazání dočasného souboru z Google Drive
    await drive.files.delete({ fileId: newDocId });

    // 6. Odeslání e-mailu
    const msg = {
      to: customerEmail,
      from: 'info@kolorky.cz', // <-- ZMĚŇTE NA VÁŠ OVĚŘENÝ E-MAIL
      subject: `Vaše personalizovaná E-kniha je připravena!`,
      text: `Dobrý den, děkujeme za vaši objednávku. V příloze naleznete svou osobní e-knihu pro ${customerName}.\n\nS pozdravem,\nTým Kolorky.`,
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
    console.error('Došlo k chybě:', error.response ? error.response.data.error : error.message);
    res.status(500).send('Internal Server Error');
  }
}