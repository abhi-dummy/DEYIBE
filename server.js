import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sgMail from '@sendgrid/mail';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve Vite static build assets
app.use(express.static(path.join(__dirname, 'dist')));

// OCR Endpoint
app.post('/api/ocr', async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body;
    const apiKey = process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Claude API key is not configured on the backend server.' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 2000,
        system: `You are an expert receipt parser. Analyze the uploaded receipt image and extract:
1. Store name (as clean as possible, e.g. "Costco" instead of "COSTCO WHOLESALE #1034")
2. Individual line items (excluding taxes, subtotals, card details, discounts).
   - For each item, extract the name and final price (after item-specific discounts).
   - If a discount was applied to the entire bill, represent it as an item with a negative price (e.g., name: "Coupon Discount", price: -5.00).
3. Subtotal
4. Tax (extremely important: look very closely for any tax lines, which may be labeled as "Tax", "Sales Tax", "GST", "HST", "PST", "VAT", "Surtax", "State Tax", "County Tax", etc. Sum all these tax lines together and put the total amount in the "tax" field of the JSON. Do NOT include tax or sales tax lines as separate entries in the "items" list).
5. Tip (if present on the receipt)
6. Total amount (the final grand total)

Return ONLY a valid JSON object matching the following structure. Do not output markdown, preambles, or formatting other than the raw JSON.
{
  "store_name": "Store Name",
  "items": [
    { "name": "Item Name", "price": 9.99 }
  ],
  "subtotal": 9.99,
  "tax": 0.80,
  "tip": 0.00,
  "total": 10.79
}`,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType || 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: 'Parse this receipt and return the items and totals in JSON format.',
              },
            ],
          },
        ],
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Claude API error: ${errorText}` });
    }

    const resJson = await response.json();
    return res.json(resJson);
  } catch (err) {
    console.error('Backend OCR error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error during OCR scan.' });
  }
});

// SendGrid OTP Endpoint
app.post('/api/send-otp', async (req, res) => {
  try {
    const { toEmail, otpCode } = req.body;
    const sgKey = process.env.VITE_SENDGRID_API_KEY || process.env.SENDGRID_API_KEY;
    const senderEmail = process.env.VITE_SENDGRID_SENDER_EMAIL || process.env.SENDGRID_SENDER_EMAIL || 'meetabhi3105@gmail.com';

    if (!sgKey) {
      console.error('SendGrid key is missing');
      return res.status(500).json({ error: 'SendGrid API key is not configured on the backend server.' });
    }

    sgMail.setApiKey(sgKey);

    const msg = {
      to: toEmail,
      from: { email: senderEmail, name: 'Deyibe Auth' },
      subject: 'Deyibe Verification Code',
      text: `Your 6-digit verification code is: ${otpCode}`,
      html: `
        <div style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; padding: 24px; border-radius: 12px; border: 1px solid rgba(25,23,21,0.08); max-width: 400px; background: #fbfbfa; color: #191715; margin: 0 auto;">
          <h2 style="font-size: 1.6rem; font-weight: 850; font-family: Georgia, serif; font-style: italic; margin-top: 0; margin-bottom: 12px; border-bottom: 1px solid rgba(25,23,21,0.06); padding-bottom: 8px;">Deyibe</h2>
          <p style="font-size: 0.9rem; color: #5e5954; line-height: 1.5; margin-bottom: 20px;">To complete your verification, please use the following 6-digit passcode:</p>
          <div style="font-size: 2.2rem; font-weight: 800; letter-spacing: 6px; padding: 18px; text-align: center; background: #f4f3f0; border-radius: 8px; margin: 20px 0; color: #191715; font-family: monospace;">
            ${otpCode}
          </div>
          <p style="font-size: 0.78rem; color: #8c857e; line-height: 1.4; margin-top: 20px; border-top: 1.5px dashed rgba(25,23,21,0.06); padding-top: 12px;">This code is valid for single use. If you did not trigger this request, you can safely ignore this email.</p>
        </div>
      `
    };

    console.log(`Disbursing OTP email via @sendgrid/mail to ${toEmail}...`);
    const response = await sgMail.send(msg);
    console.log(`SendGrid response status: ${response[0].statusCode}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('Backend Mailer error details:', err);
    if (err.response) {
      console.error('SendGrid API response details:', JSON.stringify(err.response.body));
    }
    return res.status(500).json({ error: err.message || 'Internal server error sending email.' });
  }
});

// All other requests serve SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
