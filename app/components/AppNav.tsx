import Link from 'next/link';

export function AppNav() {
  return (
    <nav className="appNav" aria-label="Navegación principal">
      <Link href="/">Analizar ticker</Link>
      <Link href="/portfolio">Cartera IOL</Link>
      <Link href="/opportunities">Oportunidades</Link>
      <Link href="/thesis-2027">Tesis 2027</Link>
      <Link href="/alerts">Alertas</Link>
      <Link href="/market">Mercado</Link>
      <Link href="/sandbox">Sandbox</Link>
      <Link href="/system">Estado del sistema</Link>
    </nav>
  );
}
