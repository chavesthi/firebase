
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
// Removed Avatar, AvatarFallback, AvatarImage imports
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Edit3, UserCircle } from 'lucide-react'; // Added UserCircle for placeholder

// Mock user data updated
const mockUser = {
  name: "Usuário Fervoso",
  email: "usuario@fervo.com",
  // profilePictureUrl removed
  preferences: ["Balada", "Bar"],
};

export default function UserProfilePage() {
  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <Card className="max-w-2xl mx-auto border-primary/70 shadow-lg shadow-primary/20">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl text-primary">Meu Perfil</CardTitle>
          <CardDescription className="text-sm sm:text-base">Gerencie suas informações e preferências.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
          {/* Avatar and photo upload button removed */}
          <div className="flex flex-col items-center space-y-2">
            <div className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-primary rounded-full flex items-center justify-center bg-muted">
              {mockUser.name ? (
                <span className="text-2xl sm:text-3xl text-primary font-semibold">
                  {mockUser.name.charAt(0).toUpperCase()}
                </span>
              ) : (
                <UserCircle className="w-14 h-14 sm:w-16 sm:h-16 text-primary" />
              )}
            </div>
             <p className="text-xs sm:text-sm text-muted-foreground">(Recurso de foto de perfil desativado)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" className="text-primary/90">Nome</Label>
            <Input id="name" defaultValue={mockUser.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-primary/90">E-mail</Label>
            <Input id="email" type="email" defaultValue={mockUser.email} disabled />
          </div>
          <div className="space-y-2">
            <Label className="text-primary/90">Preferências de Eventos</Label>
            <div className="flex flex-wrap gap-2">
              {mockUser.preferences.map(pref => (
                <Button key={pref} variant="secondary" size="sm" className="bg-primary/20 text-primary hover:bg-primary/30 cursor-default text-xs sm:text-sm">
                  {pref}
                </Button>
              ))}
               <Button variant="outline" size="sm" className="border-primary text-primary hover:bg-primary/10 text-xs sm:text-sm">
                <Edit3 className="w-3 h-3 mr-1.5" /> Editar
              </Button>
            </div>
          </div>
          <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm sm:text-base">Salvar Alterações</Button>
        </CardContent>
      </Card>
    </div>
  );
}

