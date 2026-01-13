import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

export async function sendBackInStockEmail(email, productTitle, productUrl, variantTitle) {
  try {
    const mailOptions = {
      from: `"Restockly - Stock Alerts" <${process.env.MAIL_USER}>`,
      to: email,
      subject: `🎉 ${productTitle} is Back in Stock!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
            }
            .container { 
              max-width: 600px; 
              margin: 20px auto; 
              background: #ffffff;
              border-radius: 10px;
              overflow: hidden;
              box-shadow: 0 0 20px rgba(0,0,0,0.1);
            }
            .header { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: #fff; 
              padding: 40px 20px; 
              text-align: center; 
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
            }
            .content { 
              padding: 40px 30px; 
            }
            .product-info {
              background: #f9f9f9;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #667eea;
            }
            .product-info h2 {
              margin-top: 0;
              color: #333;
              font-size: 22px;
            }
            .button { 
              display: inline-block; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: #fff !important; 
              padding: 15px 40px; 
              text-decoration: none; 
              border-radius: 50px;
              margin: 20px 0;
              font-weight: bold;
              font-size: 16px;
              box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
              transition: transform 0.2s;
            }
            .button:hover {
              transform: translateY(-2px);
            }
            .alert-box {
              background: #fff3cd;
              border: 1px solid #ffc107;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              color: #856404;
            }
            .footer { 
              text-align: center; 
              color: #666; 
              font-size: 12px; 
              padding: 20px;
              background: #f9f9f9;
              border-top: 1px solid #eee;
            }
            .emoji {
              font-size: 50px;
              margin: 10px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="emoji">🎉</div>
              <h1>Great News!</h1>
            </div>
            <div class="content">
              <div class="product-info">
                <h2>${productTitle}</h2>
                ${variantTitle && variantTitle !== "Default Title" ? `<p><strong>Variant:</strong> ${variantTitle}</p>` : ''}
              </div>
              
              <div class="alert-box">
                <strong>⚡ Hurry!</strong> The product you've been waiting for is now available. Stock is limited and might sell out quickly.
              </div>
              
              <p>You requested to be notified when this product comes back in stock, and it's finally here!</p>
              
              <center>
                <a href="${productUrl}" class="button">🛒 Shop Now</a>
              </center>
              
              <p style="margin-top: 30px; font-size: 14px; color: #666;">
                Don't wait too long - popular items sell out fast!
              </p>
            </div>
            <div class="footer">
              <p>You received this email because you subscribed to back-in-stock notifications.</p>
              <p>© ${new Date().getFullYear()} Restockly - Stock Alerts. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Good news! ${productTitle} ${variantTitle && variantTitle !== "Default Title" ? `(${variantTitle})` : ''} is back in stock! Visit ${productUrl} to purchase now before it sells out again.`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✓ Email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email sending error:", error);
    return { success: false, error: error.message };
  }
}