import Link from 'next/link';
import { FervoAppLogo as LogoIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  iconClassName?: string;
}

export function Logo({ className, iconClassName }: LogoProps) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 text-foreground", className)} aria-label="Fervo App Home">
      <LogoIcon className={cn("h-8 w-auto", iconClassName)} />
    </Link>
  );
}

