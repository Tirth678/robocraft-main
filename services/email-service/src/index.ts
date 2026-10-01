import { Elysia } from 'elysia';
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { Resend } from 'resend';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const resendApiKey = process.env.RESEND_API_KEY;

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const emailQueue = new Queue('emails', { connection: redis });

const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface PreOrderEmailData {
  type: 'pre_order_customer' | 'pre_order_admin';
  to: string;
  preOrder: {
    id: string;
    productId: string;
    productName: string;
    productDescription: string;
    productCategory: string;
    productPrice: number;
    productMrp: number;
    productImage: string | null;
    quantity: number;
    totalAmount: number;
    customerEmail: string;
    customerName: string | null;
    customerPhone: string | null;
    notes: string | null;
    createdAt: string;
  };
}

/** One fulfilled digital order line, as returned by inventory-service. */
export interface DigitalEntitlement {
  id: string;
  itemId: string;
  orderId: string;
  deliveryMode: string;
  status: string;
  downloadCount: number;
  downloadLimit: number | null;
  downloadsRemaining: number | null;
  licenseKeys: string[];
  claimUrl: string;
}

export interface DigitalDeliveryData {
  type: 'digital_delivery';
  to: string;
  orderId: string;
  customerName: string | null;
  total: number;
  entitlements: DigitalEntitlement[];
}

type EmailJob = PreOrderEmailData | DigitalDeliveryData;

async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  if (!resend) {
    console.log('[EMAIL] Would send email:', { to, subject });
    console.log('[EMAIL] HTML:', html);
    return { id: 'mock-' + Date.now() };
  }
  
  const result = await resend.emails.send({
    from: 'RoboCraft <orders@robocraft.com>',
    to,
    subject,
    html,
    text,
  });
  
  return result;
}

function generateCustomerPreOrderEmail(data: PreOrderEmailData['preOrder']) {
  const { productName, productDescription, productCategory, productPrice, productMrp, productImage, quantity, totalAmount, customerName, customerPhone, notes, createdAt } = data;
  
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  
  const savings = productMrp > productPrice ? productMrp - productPrice : 0;
  const savingsPercent = savings > 0 ? Math.round((savings / productMrp) * 100) : 0;
  
  return {
    subject: `Pre-Order Confirmed #${data.id.slice(0, 8).toUpperCase()} | RoboCraft`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RoboCraft Pre-Order Confirmation</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #08080c 0%, #1a1a24 100%); color: #ffffff;">
  
  <!-- Main Container -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 650px; margin: 0 auto; background: #08080c;">
    
    <!-- Header with RoboCraft Branding -->
    <tr>
      <td style="padding: 0;">
        <div style="background: linear-gradient(135deg, #4c1d95 0%, #6366f1 50%, #8b5cf6 100%); padding: 40px 30px; text-align: center; position: relative; overflow: hidden;">
          <!-- Futuristic Background Pattern -->
          <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: radial-gradient(circle at 25% 25%, rgba(139, 92, 246, 0.3) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(99, 102, 241, 0.3) 0%, transparent 50%); opacity: 0.6;"></div>
          
          <div style="position: relative; z-index: 2;">
            <div style="display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; background: rgba(255,255,255,0.15); border-radius: 16px; margin-bottom: 20px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2);">
              <span style="font-size: 28px;">🤖</span>
            </div>
            <h1 style="margin: 0 0 8px 0; font-size: 32px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">RoboCraft</h1>
            <p style="margin: 0; font-size: 16px; color: rgba(255,255,255,0.9); font-weight: 500;">Advanced Robotics & AI Solutions</p>
          </div>
        </div>
      </td>
    </tr>
    
    <!-- Success Banner -->
    <tr>
      <td style="padding: 0;">
        <div style="background: linear-gradient(90deg, #10b981 0%, #059669 100%); padding: 20px 30px; text-align: center;">
          <div style="display: inline-flex; align-items: center; gap: 10px; color: white;">
            <span style="font-size: 20px;">✅</span>
            <span style="font-size: 18px; font-weight: 600;">Pre-Order Successfully Placed</span>
          </div>
        </div>
      </td>
    </tr>

    <!-- Main Content -->
    <tr>
      <td style="padding: 40px 30px; background: #12121a;">
        
        <!-- Welcome Message -->
        <div style="text-align: center; margin-bottom: 40px;">
          <h2 style="margin: 0 0 16px 0; font-size: 28px; font-weight: 700; color: #ffffff; line-height: 1.2;">
            ${customerName ? `Welcome ${customerName}!` : 'Welcome to RoboCraft!'}
          </h2>
          <p style="margin: 0; font-size: 18px; color: #a1a1aa; line-height: 1.5;">
            Your pre-order for <strong style="color: #6366f1;">${productName}</strong> has been confirmed. 
            You're now in the priority queue for this cutting-edge robotics technology.
          </p>
        </div>

        <!-- Order Details Card -->
        <div style="background: linear-gradient(135deg, #1a1a24 0%, #262640 100%); border: 1px solid #374151; border-radius: 20px; padding: 30px; margin-bottom: 30px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          
          <!-- Order ID & Date -->
          <div style="text-align: center; margin-bottom: 30px; padding: 16px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 12px;">
            <div style="font-size: 14px; color: #a1a1aa; margin-bottom: 4px;">ORDER ID</div>
            <div style="font-size: 20px; font-weight: 700; color: #6366f1; font-family: 'Courier New', monospace;">#${data.id.slice(0, 8).toUpperCase()}</div>
            <div style="font-size: 14px; color: #a1a1aa; margin-top: 8px;">${formatDate(createdAt)}</div>
          </div>

          <!-- Product Details -->
          <div style="margin-bottom: 30px;">
            <h3 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; color: #ffffff; text-align: center;">Product Details</h3>
            
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
              <tr>
                <td style="width: 120px; vertical-align: top; padding-right: 20px;">
                  ${productImage 
                    ? `<img src="${productImage}" alt="${productName}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 16px; border: 2px solid #374151;">` 
                    : `<div style="width: 100px; height: 100px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 40px;">🤖</div>`
                  }
                </td>
                <td style="vertical-align: top;">
                  <h4 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #ffffff;">${productName}</h4>
                  <p style="margin: 0 0 12px 0; font-size: 15px; color: #a1a1aa; line-height: 1.4;">${productDescription}</p>
                  ${productCategory ? `<div style="display: inline-block; background: rgba(99, 102, 241, 0.2); color: #a5b4fc; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${productCategory}</div>` : ''}
                  
                  <div style="margin-top: 16px;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Quantity</div>
                    <div style="font-size: 18px; font-weight: 600; color: #ffffff;">${quantity} ${quantity > 1 ? 'units' : 'unit'}</div>
                  </div>
                </td>
              </tr>
            </table>
          </div>

          <!-- Pricing Breakdown -->
          <div style="background: #08080c; border-radius: 16px; padding: 24px; border: 1px solid #374151;">
            <h4 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: #ffffff; text-align: center;">Order Summary</h4>
            
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; font-size: 15px; color: #a1a1aa;">Unit Price</td>
                <td style="padding: 10px 0; font-size: 15px; color: #ffffff; text-align: right; font-weight: 500;">₹${productPrice.toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-size: 15px; color: #a1a1aa;">Quantity</td>
                <td style="padding: 10px 0; font-size: 15px; color: #ffffff; text-align: right; font-weight: 500;">×${quantity}</td>
              </tr>
              ${savings > 0 ? `
              <tr>
                <td style="padding: 10px 0; font-size: 15px; color: #a1a1aa;">Subtotal</td>
                <td style="padding: 10px 0; font-size: 15px; color: #6b7280; text-align: right; text-decoration: line-through;">₹${(productMrp * quantity).toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-size: 15px; color: #10b981; font-weight: 600;">Pre-Order Discount (${savingsPercent}%)</td>
                <td style="padding: 10px 0; font-size: 15px; color: #10b981; text-align: right; font-weight: 600;">-₹${(savings * quantity).toLocaleString('en-IN')}</td>
              </tr>
              ` : ''}
              <tr style="border-top: 1px solid #374151;">
                <td style="padding: 16px 0 0 0; font-size: 20px; color: #ffffff; font-weight: 700;">Total Amount</td>
                <td style="padding: 16px 0 0 0; font-size: 24px; color: #6366f1; text-align: right; font-weight: 700;">₹${totalAmount.toLocaleString('en-IN')}</td>
              </tr>
            </table>
          </div>

          ${notes ? `
          <!-- Customer Notes -->
          <div style="margin-top: 24px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 12px; padding: 20px;">
            <h5 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #3b82f6;">Your Notes</h5>
            <p style="margin: 0; font-size: 15px; color: #a1a1aa; line-height: 1.4;">"${notes}"</p>
          </div>
          ` : ''}

          ${customerPhone ? `
          <!-- Contact Info -->
          <div style="margin-top: 24px; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #6b7280;">Contact: <span style="color: #ffffff; font-weight: 500;">${customerPhone}</span></p>
          </div>
          ` : ''}
        </div>

        <!-- What's Next Section -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border: 1px solid #334155; border-radius: 20px; padding: 30px; margin-bottom: 30px;">
          <h3 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 700; color: #ffffff; text-align: center;">What Happens Next?</h3>
          
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; align-items: flex-start; gap: 16px;">
              <div style="width: 32px; height: 32px; background: #6366f1; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 4px;">
                <span style="color: white; font-weight: 700; font-size: 14px;">1</span>
              </div>
              <div>
                <h4 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #ffffff;">Production Queue</h4>
                <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 1.4;">Your order is now in our high-priority production queue. Our engineering team will begin crafting your ${productName}.</p>
              </div>
            </div>
            
            <div style="display: flex; align-items: flex-start; gap: 16px;">
              <div style="width: 32px; height: 32px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 4px;">
                <span style="color: white; font-weight: 700; font-size: 14px;">2</span>
              </div>
              <div>
                <h4 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #ffffff;">Quality Assurance</h4>
                <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 1.4;">Each unit undergoes rigorous testing and calibration to ensure peak performance and reliability.</p>
              </div>
            </div>
            
            <div style="display: flex; align-items: flex-start; gap: 16px;">
              <div style="width: 32px; height: 32px; background: #f59e0b; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 4px;">
                <span style="color: white; font-weight: 700; font-size: 14px;">3</span>
              </div>
              <div>
                <h4 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #ffffff;">Shipping Notification</h4>
                <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 1.4;">We'll send you a detailed shipping notification with tracking information once your robot is ready.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Customer Support -->
        <div style="text-align: center; padding: 24px; background: rgba(99, 102, 241, 0.05); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 16px;">
          <h4 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #ffffff;">Need Assistance?</h4>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #a1a1aa;">Our robotics specialists are here to help with any questions about your pre-order.</p>
          
          <div style="display: flex; justify-content: center; gap: 24px; margin-top: 20px;">
            <a href="mailto:support@robocraft.com" style="display: inline-flex; align-items: center; gap: 8px; background: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px;">
              📧 Email Support
            </a>
            <a href="tel:+1234567890" style="display: inline-flex; align-items: center; gap: 8px; background: #10b981; color: white; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px;">
              📞 Call Us
            </a>
          </div>
        </div>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 30px; text-align: center; background: #08080c; border-top: 1px solid #374151;">
        <div style="margin-bottom: 20px;">
          <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #ffffff;">Follow Our Innovation Journey</h4>
          <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280;">Stay updated with the latest in robotics and AI technology</p>
          
          <div style="display: flex; justify-content: center; gap: 16px;">
            <a href="#" style="display: inline-block; width: 40px; height: 40px; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 50%; text-decoration: none; display: flex; align-items: center; justify-content: center; font-size: 18px;">🐦</a>
            <a href="#" style="display: inline-block; width: 40px; height: 40px; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 50%; text-decoration: none; display: flex; align-items: center; justify-content: center; font-size: 18px;">📘</a>
            <a href="#" style="display: inline-block; width: 40px; height: 40px; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 50%; text-decoration: none; display: flex; align-items: center; justify-content: center; font-size: 18px;">📷</a>
            <a href="#" style="display: inline-block; width: 40px; height: 40px; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 50%; text-decoration: none; display: flex; align-items: center; justify-content: center; font-size: 18px;">📺</a>
          </div>
        </div>
        
        <div style="border-top: 1px solid #374151; padding-top: 20px;">
          <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
            © ${new Date().getFullYear()} RoboCraft Studio. All rights reserved.
          </p>
          <p style="margin: 0; font-size: 11px; color: #4b5563;">
            This email was sent to <span style="color: #6366f1;">${data.customerEmail}</span> regarding pre-order #${data.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
      </td>
    </tr>
  </table>
  
</body>
</html>
    `,
    text: `
🚀 RoboCraft Pre-Order Confirmation

Hi ${customerName || 'Valued Customer'}!

Your pre-order has been successfully placed:

ORDER DETAILS:
- Order ID: #${data.id.slice(0, 8).toUpperCase()}
- Product: ${productName}
- Description: ${productDescription}
- Quantity: ${quantity}
- Total Amount: ₹${totalAmount.toLocaleString('en-IN')}
- Date: ${formatDate(createdAt)}

${notes ? `YOUR NOTES: "${notes}"` : ''}

WHAT'S NEXT:
1. Production Queue - Your order is now in our high-priority production queue
2. Quality Assurance - Each unit undergoes rigorous testing and calibration  
3. Shipping Notification - We'll send tracking information once ready

NEED HELP?
Email: support@robocraft.com
Phone: +1234567890

Thank you for choosing RoboCraft for your robotics needs!

© ${new Date().getFullYear()} RoboCraft Studio. All rights reserved.
    `,
  };
}


function generateAdminPreOrderEmail(data: PreOrderEmailData['preOrder']) {
  const { productName, productDescription, productCategory, productPrice, productMrp, productImage, quantity, totalAmount, customerEmail, customerName, customerPhone, notes, createdAt } = data;
  
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  
  const savings = productMrp > productPrice ? productMrp - productPrice : 0;
  const savingsPercent = savings > 0 ? Math.round((savings / productMrp) * 100) : 0;
  
  return {
    subject: `🔔 New Pre-Order #${data.id.slice(0, 8).toUpperCase()} - ${productName} (${quantity} units)`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Pre-Order Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 30px; text-align: center; background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">🔔 New Pre-Order Received</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px;">
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; color: #991b1b; font-size: 14px; font-weight: 600;">Order ID: #${data.id.slice(0, 8).toUpperCase()} | Status: Pending</p>
          <p style="margin: 8px 0 0; color: #991b1b; font-size: 13px;">Received: ${formatDate(createdAt)}</p>
        </div>
        
        <h3 style="margin: 0 0 16px; color: #1f2937; font-size: 18px; font-weight: 600;">Customer Information</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 140px;">Email</td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px;"><strong>${customerEmail}</strong></td>
          </tr>
          ${customerName ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Name</td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px;"><strong>${customerName}</strong></td>
          </tr>
          ` : ''}
          ${customerPhone ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Phone</td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px;"><strong>${customerPhone}</strong></td>
          </tr>
          ` : ''}
        </table>
        
        <h3 style="margin: 0 0 16px; color: #1f2937; font-size: 18px; font-weight: 600;">Product Details</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="width: 80px; vertical-align: top;">
              ${productImage ? `<img src="${productImage}" alt="${productName}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;">` : `<div style="width: 60px; height: 60px; background: #f3f4f6; border-radius: 6px; display: flex; align-items: center; justify-content: center;"><span style="font-size: 24px;">🤖</span></div>`}
            </td>
            <td style="padding-left: 16px; vertical-align: top;">
              <p style="margin: 0 0 4px; color: #1f2937; font-size: 16px; font-weight: 600;">${productName}</p>
              <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">${productDescription}</p>
              ${productCategory ? `<p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Category: ${productCategory}</p>` : ''}
              <p style="margin: 0; color: #4b5563; font-size: 13px;">Quantity: <strong>${quantity}</strong> | Price: <strong>₹${productPrice.toLocaleString('en-IN')}</strong></p>
            </td>
          </tr>
        </table>
        
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Unit Price</td>
              <td style="padding: 6px 0; color: #1f2937; font-size: 13px; text-align: right;">₹${productPrice.toLocaleString('en-IN')}</td>
            </tr>
            ${savings > 0 ? `
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">MRP</td>
              <td style="padding: 6px 0; color: #9ca3af; font-size: 13px; text-align: right; text-decoration: line-through;">₹${productMrp.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #10b981; font-size: 13px; font-weight: 600;">Discount (${savingsPercent}%)</td>
              <td style="padding: 6px 0; color: #10b981; font-size: 13px; font-weight: 600; text-align: right;">-₹${(savings * quantity).toLocaleString('en-IN')}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px; border-top: 1px solid #e5e7eb;">Quantity</td>
              <td style="padding: 6px 0; color: #1f2937; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #e5e7eb;">${quantity}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #1f2937; font-size: 14px; font-weight: 600; border-top: 1px solid #e5e7eb;">Total Amount</td>
              <td style="padding: 6px 0; color: #1f2937; font-size: 16px; font-weight: 700; text-align: right; border-top: 1px solid #e5e7eb;">₹${totalAmount.toLocaleString('en-IN')}</td>
            </tr>
          </table>
        </div>
        
        ${notes ? `
        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #0369a1; font-size: 13px; font-weight: 600;">Customer Notes</p>
          <p style="margin: 0; color: #0369a1; font-size: 14px;">${notes}</p>
        </div>
        ` : ''}
        
        <div style="text-align: center;">
          <a href="${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:8080'}/admin/pre-orders/${data.id}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">View in Admin Panel</a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 30px; text-align: center; background: #f9fafb; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">This is an automated notification from RoboCraft Admin System</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `
🔔 NEW PRE-ORDER ALERT

Order ID: #${data.id.slice(0, 8).toUpperCase()}
Status: Pending
Received: ${formatDate(createdAt)}

CUSTOMER INFORMATION:
- Email: ${customerEmail}
${customerName ? `- Name: ${customerName}` : ''}
${customerPhone ? `- Phone: ${customerPhone}` : ''}

PRODUCT DETAILS:
- Product: ${productName}
- Description: ${productDescription}
${productCategory ? `- Category: ${productCategory}` : ''}
- Quantity: ${quantity}
- Unit Price: ₹${productPrice.toLocaleString('en-IN')}
${savings > 0 ? `- MRP: ₹${productMrp.toLocaleString('en-IN')} (${savingsPercent}% off)` : ''}
- Total Amount: ₹${totalAmount.toLocaleString('en-IN')}

${notes ? `CUSTOMER NOTES:\n${notes}\n` : ''}
View in Admin Panel: ${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:8080'}/admin/pre-orders/${data.id}

---
This is an automated notification from RoboCraft Admin System
    `,
  };
}

/** Entitlements carry admin-supplied license keys, so escape before embedding. */
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  );

function generateDigitalDeliveryEmail(data: DigitalDeliveryData) {
  const { orderId, customerName, total, entitlements } = data;
  const orderRef = escapeHtml(orderId.slice(0, 8).toUpperCase());
  const greeting = customerName ? `Hi ${escapeHtml(customerName)},` : 'Hi,';

  const cards = entitlements
    .map((entitlement) => {
      const keys = entitlement.licenseKeys.length
        ? `<div style="margin-top:14px">${entitlement.licenseKeys
            .map(
              (key) =>
                `<div style="background:#14141c;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;letter-spacing:0.5px;color:#e9e9f5;word-break:break-all">${escapeHtml(key)}</div>`,
            )
            .join('')}</div>`
        : '';

      const usage =
        entitlement.downloadLimit == null
          ? 'Unlimited downloads'
          : `${entitlement.downloadsRemaining ?? 0} of ${entitlement.downloadLimit} download(s) left`;

      return `
        <tr>
          <td style="padding:0 0 20px">
            <table role="presentation" width="100%" style="background:#111119;border:1px solid rgba(255,255,255,0.08);border-radius:16px">
              <tr>
                <td style="padding:22px 24px">
                  <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff">Your digital product</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#8b8ba7">${usage}</p>
                  ${keys}
                  <a href="${escapeHtml(entitlement.claimUrl)}"
                     style="display:inline-block;margin-top:16px;background:linear-gradient(135deg,#4c1d95,#6366f1);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px">
                    Open my downloads
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join('');

  const text = [
    `${greeting}`,
    '',
    `Your RoboCraft digital purchase is ready (order #${orderRef}).`,
    entitlements
      .map(
        (entitlement) =>
          `- Download link: ${entitlement.claimUrl}` +
          (entitlement.licenseKeys.length
            ? `\n  License key(s): ${entitlement.licenseKeys.join(', ')}`
            : ''),
      )
      .join('\n'),
    '',
    `Order total: INR ${total.toFixed(2)}`,
    '',
    'These links are personal to you — please do not share them.',
  ].join('\n');

  return {
    subject: `Your RoboCraft download is ready · order #${orderRef}`,
    text,
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your RoboCraft digital download</title>
  </head>
  <body style="margin:0;padding:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#08080c 0%,#1a1a24 100%);color:#ffffff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:650px;margin:0 auto;background:#08080c;">
      <tr>
        <td style="background:linear-gradient(135deg,#4c1d95 0%,#6366f1 50%,#8b5cf6 100%);padding:40px 30px;text-align:center;">
          <h1 style="margin:0 0 8px 0;font-size:30px;font-weight:700;">RoboCraft</h1>
          <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.9);">Your digital purchase is ready</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 30px 10px 30px;">
          <p style="margin:0 0 6px 0;font-size:18px;font-weight:700;">${greeting}</p>
          <p style="margin:0 0 24px 0;font-size:14px;color:rgba(255,255,255,0.65);line-height:1.6;">
            Order <strong style="color:#ffffff;">#${orderRef}</strong> is paid and your downloads are unlocked.
            Everything below is linked to your account — the keys are yours to keep.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 30px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${cards}</table>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 30px 36px 30px;">
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.5);">
            Order total: INR ${total.toFixed(2)} · Keep this link private.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

const emailWorker = new Worker<EmailJob>(
  'emails',
  async (job) => {
    const { type, to } = job.data;

    let emailContent: { subject: string; html: string; text: string };
    if (type === 'digital_delivery') {
      emailContent = generateDigitalDeliveryEmail(job.data);
    } else if (type === 'pre_order_customer') {
      emailContent = generateCustomerPreOrderEmail(job.data.preOrder);
    } else if (type === 'pre_order_admin') {
      emailContent = generateAdminPreOrderEmail(job.data.preOrder);
    } else {
      throw new Error(`Unknown email type: ${type}`);
    }
    
    await sendEmail({
      to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
    
    return { success: true, messageId: 'sent' };
  },
  { connection: redis, concurrency: 5 },
);

emailWorker.on('completed', (job) => {
  console.log(`[EMAIL] Job ${job.id} completed:`, job.name);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[EMAIL] Job ${job?.id} failed:`, err);
});

const queueEvents = new QueueEvents('emails', { connection: redis });
queueEvents.on('completed', ({ jobId }) => {
  console.log(`[EMAIL] Queue event - Job ${jobId} completed`);
});
queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`[EMAIL] Queue event - Job ${jobId} failed:`, failedReason);
});

async function addPreOrderEmailsToQueue(preOrder: PreOrderEmailData['preOrder'], adminEmail?: string) {
  // Send customer confirmation email
  await emailQueue.add('pre-order-customer', {
    type: 'pre_order_customer',
    to: preOrder.customerEmail,
    preOrder,
  });
  
  // Send admin notification email
  const adminRecipient = adminEmail || process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || 'admin@robocraft.com';
  await emailQueue.add('pre-order-admin', {
    type: 'pre_order_admin',
    to: adminRecipient,
    preOrder,
  });
}

const app = new Elysia()
  .get('/', () => ({
    service: 'email-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    queue: 'emails',
  }))
  .get('/health', async () => ({
    service: 'email-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    redis: redis.status,
    queue: await emailQueue.getJobCounts(),
  }))
  .post('/send-pre-order-emails', async ({ body, set }) => {
    const { preOrder, adminEmail } = body as { preOrder: PreOrderEmailData['preOrder']; adminEmail?: string };
    
    if (!preOrder) {
      set.status = 400;
      return { success: false, error: 'preOrder data is required' };
    }
    
    try {
      await addPreOrderEmailsToQueue(preOrder, adminEmail);
      return { success: true, message: 'Emails queued successfully' };
    } catch (error) {
      console.error('[EMAIL] Failed to queue emails:', error);
      set.status = 500;
      return { success: false, error: 'Failed to queue emails' };
    }
  })
  .post('/send-digital-delivery', async ({ body, set }) => {
    const payload = (body ?? {}) as Partial<DigitalDeliveryData> & { customerEmail?: string };
    const to = typeof payload?.to === 'string' ? payload.to : payload?.customerEmail;
    const entitlements = Array.isArray(payload?.entitlements) ? payload.entitlements : [];

    if (!to || !entitlements.length) {
      set.status = 400;
      return { success: false, error: 'customerEmail and entitlements are required' };
    }

    try {
      await emailQueue.add('digital-delivery', {
        type: 'digital_delivery',
        to,
        orderId: String(payload.orderId ?? ''),
        customerName: payload.customerName ?? null,
        total: Number(payload.total ?? 0),
        entitlements,
      });
      return { success: true, message: 'Digital delivery email queued' };
    } catch (error) {
      console.error('[EMAIL] Failed to queue digital delivery:', error);
      set.status = 500;
      return { success: false, error: 'Failed to queue email' };
    }
  })
  .listen(3005);

console.log(`Email service running at http://localhost:${app.server?.port}`);
console.log(`BullMQ email worker started with Redis: ${redisUrl}`);

process.on('SIGTERM', async () => {
  console.log('[EMAIL] Shutting down...');
  await emailWorker.close();
  await queueEvents.close();
  await emailQueue.close();
  await redis.quit();
  process.exit(0);
});
