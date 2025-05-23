
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  iconClassName?: string;
  logoSrc?: string;
  logoWidth?: number;
  logoHeight?: number;
}

export function Logo({
  className,
  iconClassName,
  logoSrc = "/images/fervoapp_logo_512x512.png",
  logoWidth = 100,  // Changed from 50
  logoHeight = 100, // Changed from 50
}: LogoProps) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-foreground", className)} aria-label="Fervo App Home">
      <Image
        src={logoSrc}
        alt="Fervo App Logo"
        width={logoWidth}
        height={logoHeight}
        className={cn(iconClassName)}
        priority // Important for LCP if this is the main logo in the header
        data-ai-hint="app logo"
      />
    </Link>
  );
}
