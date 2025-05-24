
'use client';

import { useState, useEffect, useRef } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { Logo } from '@/components/shared/logo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

export default function LoginPage() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const playLoginSound = () => {
    if (audioRef.current) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      audioRef.current.muted = isMuted; // Apply muted state before playing
      audioRef.current.currentTime = 0; // Start from beginning
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        timeoutRef.current = setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0; // Reset for next play
            setIsPlaying(false);
          }
        }, 12000); // Play for 12 seconds
      }).catch(error => console.error("Error playing login sound:", error));
    }
  };

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        if (timeoutRef.current) { // If manually paused, clear the auto-stop timeout
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else {
        // When manually played, don't enforce the 12s limit
        audioRef.current.play().then(() => setIsPlaying(true)).catch(error => console.error("Error playing audio:", error));
      }
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      const newMutedState = !isMuted;
      audioRef.current.muted = newMutedState;
      setIsMuted(newMutedState);
    }
  };

  // Autoplay attempt effect
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(error => {
        // Autoplay was prevented, which is common. User interaction will be needed.
        console.warn("Autoplay prevented:", error);
        setIsPlaying(false);
      });
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background relative">
      <audio ref={audioRef} src="/audio/Name The Time And Place - Telecasted.mp3" preload="auto" loop={false} />

      <div className="absolute top-4 left-4 sm:top-8 sm:left-8">
        <Logo />
      </div>
      <div className="w-full max-w-md p-px rounded-lg shadow-2xl bg-gradient-to-b from-primary/50 to-secondary/50"
           style={{'--card-glow-primary': 'hsl(var(--primary))', '--card-glow-secondary': 'hsl(var(--secondary))'} as React.CSSProperties}>
        <Card className="w-full bg-card/95 backdrop-blur-sm">
          <CardHeader className="flex flex-col items-center px-4 sm:px-6 pt-6 sm:pt-8">
            <div className="flex flex-row items-center justify-center gap-2">
              <Logo logoHeight={30} logoWidth={30} />
              <CardTitle className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary login-title-aura-blink">
                Bem-vindo ao Fervo App!
              </CardTitle>
            </div>
            <CardDescription className="text-muted-foreground text-sm sm:text-base mt-2 text-center">
              Encontre os melhores fervos ou cadastre seu estabelecimento.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <LoginForm onLoginSuccess={playLoginSound} />
          </CardContent>
        </Card>
      </div>
      
      {/* Music Controls */}
      <div className="fixed bottom-4 right-4 flex items-center gap-2 p-2 bg-card/70 backdrop-blur-sm rounded-lg shadow-md border border-border">
        <Button onClick={togglePlayPause} variant="ghost" size="icon" className="text-primary hover:bg-primary/10 w-8 h-8 sm:w-10 sm:h-10">
          {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5" />}
          <span className="sr-only">{isPlaying ? "Pausar música" : "Tocar música"}</span>
        </Button>
        <Button onClick={toggleMute} variant="ghost" size="icon" className="text-primary hover:bg-primary/10 w-8 h-8 sm:w-10 sm:h-10">
          {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          <span className="sr-only">{isMuted ? "Ativar som" : "Silenciar som"}</span>
        </Button>
      </div>

       <style jsx global>{`
        .shadow-2xl {
          box-shadow: 0 0 15px 5px var(--card-glow-primary), 0 0 30px 10px hsla(var(--primary), 0.3), 0 0 15px 5px var(--card-glow-secondary), 0 0 30px 10px hsla(var(--secondary), 0.3);
        }
        @keyframes loginTitleAuraBlink {
          0%, 100% {
            text-shadow: 0 0 6px hsl(var(--primary)), 0 0 10px hsl(var(--primary));
          }
          50% {
            text-shadow: 0 0 6px hsl(var(--destructive)), 0 0 10px hsl(var(--destructive));
          }
        }
        .login-title-aura-blink {
          animation: loginTitleAuraBlink 2s infinite ease-in-out;
        }
      `}</style>
    </main>
  );
}
