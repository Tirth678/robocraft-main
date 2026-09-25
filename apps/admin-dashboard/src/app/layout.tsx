import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata = {
  title: 'Admin Dashboard | RoboCraft',
  description: 'RoboCraft Admin Control Panel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#08080c] text-slate-100 min-h-screen">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
