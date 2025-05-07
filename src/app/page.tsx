'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // For now, always redirect to login.
    // TODO: Implement auth check and redirect to /map or /partner/dashboard if logged in.
    router.replace('/login');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <p className="text-foreground">Redirecionando...</p>
    </div>
  );
}
