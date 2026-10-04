import './globals.css';

export const metadata = { title: 'Senior Trading Analyst', description: 'Trading intelligence and portfolio decision platform' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
