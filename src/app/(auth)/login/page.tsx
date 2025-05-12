
'use client';

// Removed: import { useState, useEffect, useRef } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { Logo } from '@/components/shared/logo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
// Removed: import { Button } from '@/components/ui/button';
// Removed: import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

export default function LoginPage() {
  // All audio-related state, refs, and functions have been removed.
  // The useEffect hook for audio playback has been removed.
  // The misplaced Music Controls div has been removed.
  // The <audio> tag has been removed.
  // The onLoginSuccess prop from <LoginForm /> has been removed.

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background relative">
      {/* Audio Element has been removed */}
      {/* Misplaced Music Controls div has been removed */}

      <div className="absolute top-4 left-4 sm:top-8 sm:left-8">
        <Logo />
      </div>
      <div className="w-full max-w-md p-px rounded-lg shadow-2xl bg-gradient-to-b from-primary/50 to-secondary/50"
           style={{'--card-glow-primary': 'hsl(var(--primary))', '--card-glow-secondary': 'hsl(var(--secondary))'} as React.CSSProperties}>
        <Card className="w-full bg-card/95 backdrop-blur-sm">
          <CardHeader className="text-center px-4 sm:px-6 pt-6 sm:pt-8">
            <CardTitle className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Bem-vindo ao Fervo App!</CardTitle>
            <CardDescription className="text-muted-foreground text-sm sm:text-base">
              Encontre os melhores fervos ou cadastre seu estabelecimento.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <LoginForm /> {/* onLoginSuccess prop related to audio has been removed */}
          </CardContent>
        </Card>
      </div>
       <style jsx global>{`
        .shadow-2xl {
          box-shadow: 0 0 15px 5px var(--card-glow-primary), 0 0 30px 10px hsla(var(--primary), 0.3), 0 0 15px 5px var(--card-glow-secondary), 0 0 30px 10px hsla(var(--secondary), 0.3);
        }
      `}</style>
    </main>
  );
}
