/**
 * Renders the pre-order emails to plain .html files so the layout can be
 * inspected in a browser (and screenshotted) without sending mail.
 *
 *   bun run preview:email
 *   # -> .preview/preorder-customer.html
 *   # -> .preview/preorder-admin.html
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateAdminPreOrderEmail, generateCustomerPreOrderEmail } from './templates/preOrder';

const sample = {
  id: '8f14e45f-ceea-467f-a1b2-3c4d5e6f7a8b',
  productId: '3a3f3adf-be8a-486a-abff-e7d162f5eea6',
  productName: 'RoboCraft Custom Build',
  productDescription:
    'A hand-assembled desk robot with 40+ expressions, 5 moods and a custom shell finish.',
  productCategory: 'Custom Kits',
  productPrice: 5999,
  productMrp: 7999,
  productImage: 'http://localhost:8080/src/assets/robot-custom.jpg',
  quantity: 1,
  totalAmount: 5999,
  customerEmail: 'tirth@robocraft.com',
  customerName: 'Tirth Parmar',
  customerPhone: '+91 98765 43210',
  notes: 'Please use the matte black shell with the purple LED eyes.',
  createdAt: new Date().toISOString(),
};

const outDir = join(import.meta.dir, '../../../.preview');
await mkdir(outDir, { recursive: true });

const customer = generateCustomerPreOrderEmail(sample);
const admin = generateAdminPreOrderEmail(sample);

await writeFile(join(outDir, 'preorder-customer.html'), customer.html, 'utf8');
await writeFile(join(outDir, 'preorder-admin.html'), admin.html, 'utf8');

console.log(`customer: ${customer.subject}`);
console.log(`  -> ${join(outDir, 'preorder-customer.html')}`);
console.log(`admin:    ${admin.subject}`);
console.log(`  -> ${join(outDir, 'preorder-admin.html')}`);
