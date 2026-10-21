import { Elysia } from 'elysia';
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { Resend } from 'resend';
import {
  generateAdminPreOrderEmail,
  generateCustomerPreOrderEmail,
  type PreOrderEmailData,
} from './templates/preOrder';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const resendApiKey = process.env.RESEND_API_KEY;

// PaaS platforms (Railway, Render, Fly) inject PORT and route traffic to it, so
// the listener must honour it. Hardcoding 3005 fails their health checks.
const port = Number(process.env.EMAIL_SERVICE_PORT ?? process.env.PORT ?? 3005);

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const emailQueue = new Queue('emails', { connection: redis });

const resend = resendApiKey ? new Resend(resendApiKey) : null;

const emailFrom = process.env.EMAIL_FROM || 'RoboCraft <onboarding@resend.dev>';

/**
 * Resend only delivers to the account owner's own address until a sending
 * domain is verified, and rejects everything else with a 403. While that is the
 * case every message is funnelled into one inbox so the flow still works end to
 * end; the original recipient stays in the subject and in Reply-To so the mail
 * is still recognisably "to the customer".
 *
 * Unset this once a domain is verified at resend.com/domains. It is always
 * ignored for messages that already target the redirect address.
 */
const redirectTo = process.env.EMAIL_REDIRECT_TO?.trim() || null;

/** Sending from resend.dev means the account has no verified domain yet. */
const sandboxSender = /@resend\.dev>?$/i.test(emailFrom);

/** Resend job options shared by every queue producer. */
const jobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

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

function resolveRecipient(to: string) {
  const forwarded = redirectTo && redirectTo.toLowerCase() !== to.toLowerCase();
  return {
    to: forwarded ? redirectTo! : to,
    subjectPrefix: forwarded ? `[to ${to}] ` : '',
  };
}

async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  const { to: recipient, subjectPrefix } = resolveRecipient(to);
  const subjectLine = `${subjectPrefix}${subject}`;

  if (!resend) {
    console.log('[EMAIL] RESEND_API_KEY is not set — not sending:', {
      to: recipient,
      subject: subjectLine,
    });
    throw new Error('RESEND_API_KEY is not set, so no email could be sent');
  }

  const result = await resend.emails.send({
    from: emailFrom,
    to: recipient,
    // Replies from the inbox we redirected to should reach the real person.
    reply_to: recipient === to ? undefined : to,
    subject: subjectLine,
    html,
    text,
  });

  if (result.error) {
    // Surface the failure instead of logging and returning: BullMQ marks a job
    // completed as soon as its handler resolves, so a swallowed provider error
    // silently drops the email (Resend's sandbox 403 is the usual culprit).
    console.error(`[EMAIL] Resend rejected ${to}:`, result.error);
    throw new Error(
      `Resend rejected message to ${to}: ${result.error.name ?? 'error'} — ${result.error.message}`,
    );
  }

  console.log(
    `[EMAIL] Resend sent ${result.data?.id} to ${recipient}${recipient === to ? '' : ` (redirected from ${to})`}`,
  );
  return result;
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
  const customerJob = await emailQueue.add(
    'pre-order-customer',
    {
      type: 'pre_order_customer',
      to: preOrder.customerEmail,
      preOrder,
    },
    jobOptions,
  );

  // Send admin notification email
  const adminRecipient =
    adminEmail || process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || 'admin@robocraft.com';
  const adminJob = await emailQueue.add(
    'pre-order-admin',
    {
      type: 'pre_order_admin',
      to: adminRecipient,
      preOrder,
    },
    jobOptions,
  );

  return {
    customerJobId: customerJob.id,
    adminJobId: adminJob.id,
    customerTo: resolveRecipient(preOrder.customerEmail).to,
    adminTo: resolveRecipient(adminRecipient).to,
    redirected: Boolean(redirectTo),
  };
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
    delivery: {
      from: emailFrom,
      // Sandbox senders can only reach the Resend account owner.
      sandbox: sandboxSender,
      redirectTo,
    },
  }))
  .post('/send-pre-order-emails', async ({ body, set }) => {
    const { preOrder, adminEmail } = body as { preOrder: PreOrderEmailData['preOrder']; adminEmail?: string };
    
    if (!preOrder) {
      set.status = 400;
      return { success: false, error: 'preOrder data is required' };
    }
    
    try {
      const queued = await addPreOrderEmailsToQueue(preOrder, adminEmail);
      return { success: true, message: 'Emails queued successfully', data: queued };
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
      await emailQueue.add(
        'digital-delivery',
        {
          type: 'digital_delivery',
          to,
          orderId: String(payload.orderId ?? ''),
          customerName: payload.customerName ?? null,
          total: Number(payload.total ?? 0),
          entitlements,
        },
        jobOptions,
      );
      return { success: true, message: 'Digital delivery email queued' };
    } catch (error) {
      console.error('[EMAIL] Failed to queue digital delivery:', error);
      set.status = 500;
      return { success: false, error: 'Failed to queue email' };
    }
  })
  .listen(port);

console.log(`Email service running at http://localhost:${app.server?.port}`);
console.log(`BullMQ email worker started with Redis: ${redisUrl}`);
console.log(`[EMAIL] Sending from: ${emailFrom}`);
if (redirectTo) {
  console.warn(`[EMAIL] EMAIL_REDIRECT_TO is set — every message goes to ${redirectTo}`);
}
if (sandboxSender) {
  console.warn(
    '[EMAIL] Sandbox sender detected: Resend only delivers to the account owner until a ' +
      'domain is verified at resend.com/domains. Set EMAIL_FROM to an address on that domain.',
  );
}

process.on('SIGTERM', async () => {
  console.log('[EMAIL] Shutting down...');
  await emailWorker.close();
  await queueEvents.close();
  await emailQueue.close();
  await redis.quit();
  process.exit(0);
});
