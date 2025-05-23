
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  iconClassName?: string; // Pode ser usado para estilização adicional da imagem se necessário
  // Se você quiser que o nome do arquivo e as dimensões sejam dinâmicos,
  // podemos adicioná-los como props aqui também.
  // Por agora, usarei placeholders.
  logoSrc?: string;
  logoWidth?: number;
  logoHeight?: number;
}

export function Logo({
  className,
  iconClassName,
  logoSrc = "/images/novo-logo.png", // Placeholder: substitua pelo caminho real do seu logo
  logoWidth = 150, // Placeholder: substitua pela largura real
  logoHeight = 40, // Placeholder: substitua pela altura real
}: LogoProps) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-foreground", className)} aria-label="Fervo App Home">
      <Image
        src={logoSrc}
        alt="Fervo App Logo"
        width={logoWidth}
        height={logoHeight}
        className={cn(iconClassName)}
        priority // Considere adicionar 'priority' se este logo for um elemento LCP (Largest Contentful Paint)
        data-ai-hint="app logo" // Data AI hint
      />
    </Link>
  );
}
