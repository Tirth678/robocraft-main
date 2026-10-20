/**
 * Pre-order transactional email.
 *
 * Deliberately built from nested `<table>`s with inline styles and solid
 * colours: Gmail, Outlook and Apple Mail ignore `display:flex`, strip
 * `<style>` blocks and refuse CSS gradients on most elements, which is what
 * made the previous version collapse into a wall of unstyled text. No web
 * fonts, no flexbox, no gradient backgrounds — only what email clients render.
 */

export interface PreOrderDetails {
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
}

export interface PreOrderEmailData {
  type: 'pre_order_customer' | 'pre_order_admin';
  to: string;
  preOrder: PreOrderDetails;
}

const COLORS = {
  page: '#f4f4f5',
  card: '#ffffff',
  ink: '#18181b',
  body: '#3f3f46',
  muted: '#71717a',
  border: '#e4e4e7',
  accent: '#6d28d9',
  accentSoft: '#f5f3ff',
  warnBg: '#fffbeb',
  warnBorder: '#fde68a',
  warnInk: '#92400e',
  success: '#047857',
} as const;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  );

const inr = (value: number) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const shortRef = (id: string) => id.slice(0, 8).toUpperCase();

const formatLongDate = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' IST';

const adminBase = () => (process.env.ADMIN_DASHBOARD_URL || 'http://localhost:8082').replace(/\/+$/, '');
const supportEmail = process.env.SUPPORT_EMAIL || 'support@robocraft.com';

/** Coloured bar + wordmark. Shared by every pre-order email. */
const header = (kicker: string) => `
        <tr>
          <td bgcolor="${COLORS.accent}" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:24px 32px 20px 32px;background:${COLORS.card};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="left" style="font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:2.5px;color:${COLORS.ink};">
                  ROBOCRAFT
                </td>
                <td align="right" style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.muted};">
                  ${escapeHtml(kicker)}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

const footer = (recipient: string, reason: string) => `
        <tr>
          <td style="padding:24px 32px 32px 32px;background:${COLORS.page};border-top:1px solid ${COLORS.border};">
            <p style="margin:0 0 6px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">
              ${escapeHtml(reason)}
            </p>
            <p style="margin:0 0 10px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">
              Sent to ${escapeHtml(recipient)} · RoboCraft Studio, India
            </p>
            <p style="margin:0;font-family:${FONT};font-size:11px;line-height:16px;color:#a1a1aa;">
              © ${new Date().getFullYear()} RoboCraft Studio. All rights reserved.
            </p>
          </td>
        </tr>`;

const productRow = (product: PreOrderDetails) => {
  const image = product.productImage
    ? `<img src="${escapeHtml(product.productImage)}" width="84" height="84" alt="${escapeHtml(product.productName)}" style="display:block;width:84px;height:84px;border:1px solid ${COLORS.border};border-radius:10px;object-fit:cover;" />`
    : `<table role="presentation" width="84" cellpadding="0" cellspacing="0" border="0" style="width:84px;"><tr><td align="center" bgcolor="${COLORS.accentSoft}" height="84" style="height:84px;border-radius:10px;font-family:${FONT};font-size:18px;font-weight:700;color:${COLORS.accent};">RC</td></tr></table>`;

  return `
        <tr>
          <td style="padding:0 0 24px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${COLORS.border};border-radius:12px;">
              <tr>
                <td width="84" valign="top" style="padding:18px 0 18px 18px;">${image}</td>
                <td valign="top" style="padding:18px 18px 18px 16px;font-family:${FONT};">
                  ${
                    product.productCategory
                      ? `<p style="margin:0 0 6px 0;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${COLORS.muted};">${escapeHtml(product.productCategory)}</p>`
                      : ''
                  }
                  <p style="margin:0 0 6px 0;font-size:16px;font-weight:700;line-height:22px;color:${COLORS.ink};">${escapeHtml(product.productName)}</p>
                  ${
                    product.productDescription
                      ? `<p style="margin:0 0 10px 0;font-size:13px;line-height:19px;color:${COLORS.muted};">${escapeHtml(product.productDescription)}</p>`
                      : ''
                  }
                  <p style="margin:0;font-size:13px;line-height:19px;color:${COLORS.body};">
                    Qty <strong>${product.quantity}</strong> &nbsp;·&nbsp; ${inr(product.productPrice)} each
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
};

const totalsRows = (product: PreOrderDetails) => {
  const mrpTotal = product.productMrp * product.quantity;
  const discount = Math.max(0, mrpTotal - product.totalAmount);
  const rows = [
    `<tr>
      <td style="padding:8px 0;font-family:${FONT};font-size:14px;color:${COLORS.muted};">Subtotal</td>
      <td align="right" style="padding:8px 0;font-family:${FONT};font-size:14px;color:${COLORS.body};">${inr(mrpTotal)}</td>
    </tr>`,
  ];

  if (discount > 0) {
    const percent = Math.round((discount / mrpTotal) * 100);
    rows.push(`<tr>
      <td style="padding:8px 0;font-family:${FONT};font-size:14px;color:${COLORS.success};">Pre-order discount (${percent}%)</td>
      <td align="right" style="padding:8px 0;font-family:${FONT};font-size:14px;color:${COLORS.success};">−${inr(discount)}</td>
    </tr>`);
  }

  rows.push(`<tr>
      <td style="padding:14px 0 0 0;border-top:1px solid ${COLORS.border};font-family:${FONT};font-size:15px;font-weight:700;color:${COLORS.ink};">Total</td>
      <td align="right" style="padding:14px 0 0 0;border-top:1px solid ${COLORS.border};font-family:${FONT};font-size:20px;font-weight:700;color:${COLORS.ink};">${inr(product.totalAmount)}</td>
    </tr>`);

  return rows.join('');
};

export function generateCustomerPreOrderEmail(product: PreOrderDetails) {
  const ref = shortRef(product.id);
  const firstName = product.customerName?.trim().split(/\s+/)[0] ?? null;
  const paymentDue = new Date(new Date(product.createdAt).getTime() + 15 * 24 * 60 * 60 * 1000);
  const dueDate = formatLongDate(paymentDue.toISOString());
  // Pre-orders are settled manually, so the CTA opens a mail thread rather
  // than linking to a page that cannot take the payment yet.
  const ctaUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(
    `Payment for pre-order #${ref}`,
  )}`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Pre-order confirmed · RoboCraft</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.page};">
    <div style="display:none;font-size:1px;color:${COLORS.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      Pre-order #${ref} is confirmed — ${inr(product.totalAmount)} due by ${escapeHtml(dueDate)}.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:14px;overflow:hidden;">
${header('Pre-order confirmed')}
            <tr>
              <td style="padding:8px 32px 0 32px;background:${COLORS.card};">
                <h1 style="margin:0 0 8px 0;font-family:${FONT};font-size:24px;line-height:31px;font-weight:700;color:${COLORS.ink};">
                  ${firstName ? `Thanks, ${escapeHtml(firstName)} —` : 'Thanks —'} your pre-order is in.
                </h1>
                <p style="margin:0 0 20px 0;font-family:${FONT};font-size:14px;line-height:21px;color:${COLORS.muted};">
                  We have reserved your place in the production queue for
                  <strong style="color:${COLORS.ink};">${escapeHtml(product.productName)}</strong>.
                  Your slot is confirmed once payment is received.
                </p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.accentSoft};border-radius:10px;margin:0 0 24px 0;">
                  <tr>
                    <td style="padding:14px 18px;font-family:${FONT};">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${COLORS.muted};">Order</td>
                          <td align="right" style="font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${COLORS.muted};">Placed</td>
                        </tr>
                        <tr>
                          <td style="padding-top:4px;font-size:15px;font-weight:700;color:${COLORS.accent};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">#${ref}</td>
                          <td align="right" style="padding-top:4px;font-size:13px;color:${COLORS.body};">${escapeHtml(formatLongDate(product.createdAt))}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 32px;background:${COLORS.card};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${productRow(product)}
                  <tr>
                    <td style="padding:0 0 24px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${totalsRows(product)}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 32px 24px 32px;background:${COLORS.card};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.warnBg};border:1px solid ${COLORS.warnBorder};border-radius:12px;">
                  <tr>
                    <td style="padding:20px;font-family:${FONT};">
                      <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${COLORS.warnInk};">Payment due</p>
                      <p style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:${COLORS.ink};">${inr(product.totalAmount)}</p>
                      <p style="margin:0 0 16px 0;font-size:13px;line-height:20px;color:${COLORS.body};">
                        Please complete payment by <strong>${escapeHtml(dueDate)}</strong> (15 days from your
                        pre-order date). After that the slot is released to the next customer.
                      </p>
                      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;font-family:${FONT};font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:8px;">Complete payment</a>
                      <p style="margin:12px 0 0 0;font-size:12px;line-height:18px;color:${COLORS.muted};">
                        Or reply to this email — we will send a payment link and receipt.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${
              product.notes
                ? `<tr>
              <td style="padding:0 32px 24px 32px;background:${COLORS.card};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:3px solid ${COLORS.accent};">
                  <tr>
                    <td style="padding:2px 0 2px 14px;font-family:${FONT};">
                      <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${COLORS.muted};">Your notes</p>
                      <p style="margin:0;font-size:13px;line-height:20px;color:${COLORS.body};">${escapeHtml(product.notes)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
                : ''
            }

            <tr>
              <td style="padding:0 32px 28px 32px;background:${COLORS.card};">
                <p style="margin:0 0 12px 0;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${COLORS.muted};">What happens next</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="top" width="26" style="padding:0 0 10px 0;font-family:${FONT};font-size:13px;font-weight:700;color:${COLORS.accent};">1.</td>
                    <td style="padding:0 0 10px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.body};">
                      <strong style="color:${COLORS.ink};">Production</strong> — your unit is queued and assembly begins once payment clears.
                    </td>
                  </tr>
                  <tr>
                    <td valign="top" width="26" style="padding:0 0 10px 0;font-family:${FONT};font-size:13px;font-weight:700;color:${COLORS.accent};">2.</td>
                    <td style="padding:0 0 10px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.body};">
                      <strong style="color:${COLORS.ink};">Testing</strong> — every unit is calibrated and tested before it ships.
                    </td>
                  </tr>
                  <tr>
                    <td valign="top" width="26" style="font-family:${FONT};font-size:13px;font-weight:700;color:${COLORS.accent};">3.</td>
                    <td style="font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.body};">
                      <strong style="color:${COLORS.ink};">Shipping</strong> — we email tracking details as soon as it leaves the studio.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 32px 28px 32px;background:${COLORS.card};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.border};">
                  <tr>
                    <td style="padding-top:18px;font-family:${FONT};font-size:12px;line-height:19px;color:${COLORS.muted};">
                      Questions about this order? Reply to this email or write to
                      <a href="mailto:${escapeHtml(supportEmail)}" style="color:${COLORS.accent};text-decoration:none;">${escapeHtml(supportEmail)}</a>.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
${footer(product.customerEmail, 'You are receiving this because you placed a pre-order with RoboCraft.')}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Pre-order confirmed — RoboCraft`,
    '',
    `Order #${ref}`,
    `Placed: ${formatDateTime(product.createdAt)}`,
    '',
    `Product: ${product.productName}`,
    product.productCategory ? `Category: ${product.productCategory}` : null,
    `Quantity: ${product.quantity}`,
    `Unit price: ${inr(product.productPrice)}`,
    `Total: ${inr(product.totalAmount)}`,
    '',
    `Payment of ${inr(product.totalAmount)} is due by ${dueDate} (15 days from your pre-order date).`,
    `Complete payment: ${ctaUrl}`,
    'Or reply to this email and we will send a payment link.',
    '',
    "What happens next:",
    '1. Production — your unit is queued once payment clears.',
    '2. Testing — every unit is calibrated before shipping.',
    '3. Shipping — tracking details follow by email.',
    '',
    product.notes ? `Your notes: ${product.notes}` : null,
    '',
    `Questions? ${supportEmail}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return {
    subject: `Pre-order confirmed · #${ref} · ${product.productName}`,
    html,
    text,
  };
}

export function generateAdminPreOrderEmail(product: PreOrderDetails) {
  const ref = shortRef(product.id);
  const adminUrl = `${adminBase()}/admin/pre-orders/${encodeURIComponent(product.id)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>New pre-order #${ref}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.page};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:14px;overflow:hidden;">
${header('New pre-order')}
            <tr>
              <td style="padding:8px 32px 0 32px;background:${COLORS.card};font-family:${FONT};">
                <h1 style="margin:0 0 6px 0;font-size:22px;line-height:29px;font-weight:700;color:${COLORS.ink};">
                  #${ref} · ${escapeHtml(product.productName)}
                </h1>
                <p style="margin:0 0 20px 0;font-size:13px;line-height:20px;color:${COLORS.muted};">
                  Received ${escapeHtml(formatDateTime(product.createdAt))} · status <strong style="color:${COLORS.warnInk};">pending payment</strong>
                </p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.border};">
                  <tr>
                    <td style="padding:14px 0 6px 0;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${COLORS.muted};">Customer</td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
                  ${product.customerName ? `<tr><td style="padding:3px 0;font-size:14px;color:${COLORS.ink};font-weight:600;">${escapeHtml(product.customerName)}</td></tr>` : ''}
                  <tr><td style="padding:3px 0;font-size:14px;color:${COLORS.body};">${escapeHtml(product.customerEmail)}</td></tr>
                  ${product.customerPhone ? `<tr><td style="padding:3px 0;font-size:14px;color:${COLORS.body};">${escapeHtml(product.customerPhone)}</td></tr>` : ''}
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 32px;background:${COLORS.card};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${productRow(product)}
                  <tr>
                    <td style="padding:0 0 22px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${totalsRows(product)}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${
              product.notes
                ? `<tr>
              <td style="padding:0 32px 22px 32px;background:${COLORS.card};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.accentSoft};border-radius:10px;">
                  <tr>
                    <td style="padding:14px 16px;font-family:${FONT};">
                      <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${COLORS.muted};">Customer notes</p>
                      <p style="margin:0;font-size:13px;line-height:20px;color:${COLORS.body};">${escapeHtml(product.notes)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
                : ''
            }

            <tr>
              <td style="padding:0 32px 28px 32px;background:${COLORS.card};">
                <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;font-family:${FONT};font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:8px;">Open in admin panel</a>
              </td>
            </tr>
${footer(process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || 'admin@robocraft.com', 'Automated notification from the RoboCraft admin system.')}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `NEW PRE-ORDER #${ref}`,
    `Received: ${formatDateTime(product.createdAt)}`,
    'Status: pending payment',
    '',
    `Customer: ${product.customerName ?? '—'} <${product.customerEmail}>`,
    product.customerPhone ? `Phone: ${product.customerPhone}` : null,
    '',
    `Product: ${product.productName}`,
    `Quantity: ${product.quantity}`,
    `Unit price: ${inr(product.productPrice)}`,
    `Total: ${inr(product.totalAmount)}`,
    '',
    product.notes ? `Notes: ${product.notes}` : null,
    '',
    `Open in admin panel: ${adminUrl}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return {
    subject: `New pre-order #${ref} — ${product.productName} × ${product.quantity}`,
    html,
    text,
  };
}
