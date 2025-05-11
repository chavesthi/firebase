
'use client';

import { useState, useEffect, useRef } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { Logo } from '@/components/shared/logo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

export default function LoginPage() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false); 
  const [isAudioMuted, setIsAudioMuted] = useState(true);    

  // Attempt to play on mount (muted)
  useEffect(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
      audioElement.loop = true;
      audioElement.muted = true; // Start muted for autoplay policies
      audioElement.play()
        .then(() => {
          setIsAudioPlaying(true); 
        })
        .catch(error => {
          console.warn("Muted autoplay was prevented on load:", error);
          setIsAudioPlaying(false);
        });
    }
  }, []);

  // Effect to control play/pause based on isAudioPlaying state
  useEffect(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
      if (isAudioPlaying) {
        audioElement.play().catch(error => console.warn("Audio play command failed:", error));
      } else {
        audioElement.pause();
      }
    }
  }, [isAudioPlaying]);

  // Effect to control mute based on isAudioMuted state
  useEffect(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
      audioElement.muted = isAudioMuted;
    }
  }, [isAudioMuted]);


  const togglePlayPause = () => {
    setIsAudioPlaying(prev => !prev);
    // If it was muted and we are trying to play, unmute it.
    if (!isAudioPlaying && isAudioMuted) {
        setIsAudioMuted(false);
    }
  };

  const toggleMute = () => {
    setIsAudioMuted(prev => !prev);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-background relative">
      {/* 
        Audio Element: 
        Please create a folder named 'audio' inside your 'public' directory.
        Then, place your desired login music file (e.g., 'login-music.mp3') into 'public/audio/'.
        If you use a different filename or path, update the src attribute below accordingly.
      */}
      <audio ref={audioRef} src="/audio/login-music.mp3" preload="auto" />

      {/* Music Controls */}
      <div className="absolute bottom-4 right-4 sm:bottom-8 sm:right-8 flex gap-2 z-10">
        <Button variant="ghost" size="icon" onClick={togglePlayPause} className="text-primary hover:bg-primary/10" aria-label={isAudioPlaying ? 'Pausar música' : 'Tocar música'}>
          {isAudioPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleMute} className="text-primary hover:bg-primary/10" aria-label={isAudioMuted ? 'Ativar som' : 'Desativar som'}>
          {isAudioMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </Button>
      </div>

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
            <LoginForm />
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
