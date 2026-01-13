import nodemailer from "nodemailer";

// Configure your email service
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER, // Your email
    pass: process.env.SMTP_PASS, // Your email password or app password
  },
});

export async function sendBackInStockEmail(email, productTitle, productUrl, variantTitle) {
  try {
    const mailOptions = {
      from: `"${process.env.SHOP_NAME || 'Your Store'}" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `🎉 ${productTitle} is Back in Stock!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000; color: #fff; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; margin: 20px 0; }
            .button { 
              display: inline-block; 
              background: #000; 
              color: #fff !important; 
              padding: 15px 30px; 
              text-decoration: none; 
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Great News!</h1>
            </div>
            <div class="content">
              <h2>${productTitle} ${variantTitle ? `- ${variantTitle}` : ''} is back in stock! 🎉</h2>
              <p>The product you were waiting for is now available.</p>
              <p>Hurry! Stock is limited and might sell out quickly.</p>
              <center>
                <a href="${productUrl}" class="button">Shop Now</a>
              </center>
            </div>
            <div class="footer">
              <p>You received this email because you subscribed to back-in-stock notifications.</p>
              <p>© ${new Date().getFullYear()} ${process.env.SHOP_NAME || 'Your Store'}. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `${productTitle} ${variantTitle ? `- ${variantTitle}` : ''} is back in stock! Visit ${productUrl} to purchase now.`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✓ Email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email error:", error);
    return { success: false, error: error.message };
  }
}