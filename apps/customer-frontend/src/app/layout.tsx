export const metadata = {
  title: 'Customer Frontend',
  description: 'RoboCraft Customer Frontend App',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
