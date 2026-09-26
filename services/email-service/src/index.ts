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
  const { productName, productDescription, productCategory, productPrice, productMrp, productImage, quantity, totalAmount, customerName, createdAt } = data;
  
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
    subject: `Your Pre-Order Confirmation #${data.id.slice(0, 8).toUpperCase()} - RoboCraft`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pre-Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">RoboCraft</h1>
        <p style="margin: 10px 0 0; color: #fce7f3; font-size: 16px;">Pre-Order Confirmation</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px;">
        <h2 style="margin: 0 0 20px; color: #1f2937; font-size: 24px; font-weight: 600;">Thank you for your pre-order${customerName ? `, ${customerName}` : ''}!</h2>
        <p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 1.6;">We've received your pre-order and will notify you as soon as ${productName} is available for shipping.</p>
        
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 30px;">
          <tr>
            <td style="width: 100px; vertical-align: top;">
              ${productImage ? `<img src="${productImage}" alt="${productName}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;">` : `<div style="width: 80px; height: 80px; background: #f3f4f6; border-radius: 8px; display: flex; align-items: center; justify-content: center;"><span style="font-size: 32px;">🤖</span></div>`}
            </td>
            <td style="padding-left: 20px; vertical-align: top;">
              <h3 style="margin: 0 0 8px; color: #1f2937; font-size: 18px; font-weight: 600;">${productName}</h3>
              <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">${productDescription}</p>
              ${productCategory ? `<p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Category: ${productCategory}</p>` : ''}
              <p style="margin: 0; color: #4b5563; font-size: 14px;">Quantity: <strong>${quantity}</strong></p>
            </td>
          </tr>
        </table>
        
        <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 30px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Subtotal (${quantity} × ₹${productPrice.toLocaleString('en-IN')})</td>
              <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">₹${(productPrice * quantity).toLocaleString('en-IN')}</td>
            </tr>
            ${savings > 0 ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Discount (${savingsPercent}% off)</td>
              <td style="padding: 8px 0; color: #10b981; font-size: 14px; text-align: right;">-₹${(savings * quantity).toLocaleString('en-IN')}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb;">Total</td>
              <td style="padding: 8px 0; color: #1f2937; font-size: 18px; font-weight: 700; text-align: right; border-top: 1px solid #e5e7eb;">₹${totalAmount.toLocaleString('en-IN')}</td>
            </tr>
          </table>
        </div>
        
        <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin-bottom: 30px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>What happens next?</strong> We'll email you when ${productName} is back in stock and ready to ship. Your pre-order secures your place in line!</p>
        </div>
        
        <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Order ID: <strong>#${data.id.slice(0, 8).toUpperCase()}</strong></p>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Placed on: <strong>${formatDate(createdAt)}</strong></p>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px; text-align: center; background: #f9fafb; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px;">Questions? Contact us at <a href="mailto:support@robocraft.com" style="color: #a855f7;">support@robocraft.com</a></p>
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">© ${new Date().getFullYear()} RoboCraft Studio. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `
Thank you for your pre-order${customerName ? `, ${customerName}` : ''}!

We've received your pre-order for ${productName} and will notify you as soon as it's available for shipping.

Order Details:
- Product: ${productName}
- Description: ${productDescription}
${productCategory ? `- Category: ${productCategory}` : ''}
- Quantity: ${quantity}
- Price per unit: ₹${productPrice.toLocaleString('en-IN')}
${savings > 0 ? `- Discount: ${savingsPercent}% off (₹${(savings * quantity).toLocaleString('en-IN')} saved)` : ''}
- Total: ₹${totalAmount.toLocaleString('en-IN')}

Order ID: #${data.id.slice(0, 8).toUpperCase()}
Placed on: ${formatDate(createdAt)}

What happens next? We'll email you when ${productName} is back in stock and ready to ship. Your pre-order secures your place in line!

Questions? Contact us at support@robocraft.com

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
          <a href="${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3006'}/admin/pre-orders/${data.id}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">View in Admin Panel</a>
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
View in Admin Panel: ${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3006'}/admin/pre-orders/${data.id}

---
This is an automated notification from RoboCraft Admin System
    `,
  };
}

const emailWorker = new Worker<PreOrderEmailData>(
  'emails',
  async (job) => {
    const { type, to, preOrder } = job.data;
    
    let emailContent;
    if (type === 'pre_order_customer') {
      emailContent = generateCustomerPreOrderEmail(preOrder);
    } else if (type === 'pre_order_admin') {
      emailContent = generateAdminPreOrderEmail(preOrder);
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
queueEvents.on('completed', ({ jobId, returnvalue }) => {
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