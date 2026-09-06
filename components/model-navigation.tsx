import Link from 'next/link';

export default function ModelNavigation({
  active,
}: {
  active: 'crescent' | 'miku';
}) {
  return (
    <nav className="model-navigation" aria-label="Choose a 3D model">
      <Link href="/" aria-current={active === 'crescent' ? 'page' : undefined}>
        Crescent Rose
      </Link>
      <Link href="/miku" aria-current={active === 'miku' ? 'page' : undefined}>
        Hatsune Miku
      </Link>
    </nav>
  );
}
