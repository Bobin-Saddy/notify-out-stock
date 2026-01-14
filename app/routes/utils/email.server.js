import nodemailer from "nodemailer";

// Using Port 587 is more reliable on cloud hosts like Railway
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // Use false for Port 587
  requireTLS: true,
  secureConnection: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS, 
  },
  // Add these specific TLS settings for cloud environments
  tls: {
    rejectUnauthorized: false,
    minVersion: "TLSv1.2"
  },
  connectionTimeout: 20000, // Increase to 20 seconds
});

export async function sendBackInStockEmail(email, productName, variantName, productUrl, shop) {
  try {
    const mailOptions = {
      from: `"${shop}" <${process.env.MAIL_USER}>`,
      to: email,
      subject: `🔔 ${productName} is Back in Stock!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: #000; color: #fff; padding: 30px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { padding: 40px 30px; text-align: center; }
            .product-name { font-size: 24px; font-weight: bold; color: #000; margin-bottom: 10px; }
            .variant-name { font-size: 16px; color: #666; margin-bottom: 20px; }
            .message { font-size: 16px; color: #555; margin-bottom: 30px; line-height: 1.6; }
            .button { display: inline-block; padding: 15px 40px; background: #28a745; color: white !important; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; background: #f9f9f9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>🎉 Great News!</h1></div>
            <div class="content">
              <div class="product-name">${productName}</div>
              ${variantName !== 'Default Title' ? `<div class="variant-name">${variantName}</div>` : ''}
              <p class="message">The product you've been waiting for is back in stock!<br>Don't miss out - grab it before it's gone again.</p>
              <a href="${productUrl}" class="button">Shop Now →</a>
            </div>
            <div class="footer"><p>© ${new Date().getFullYear()} ${shop}</p></div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", info.messageId);
    return { success: true };
    
  } catch (error) {
    console.error("❌ Nodemailer Error:", error.message);
    throw error;
  }
}