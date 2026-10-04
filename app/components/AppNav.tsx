import Link from 'next/link';

export function AppNav() {
  return (
    <nav className="appNav" aria-label="Navegación principal">
      <Link href="/">Analizar ticker</Link>
      <Link href="/portfolio">Mi Cartera IOL</Link>
    </nav>
  );
}
