
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
    <div className="container py-8 mx-auto">
      <Card className="max-w-2xl mx-auto border-primary/70 shadow-lg shadow-primary/20">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl text-primary">Meu Perfil</CardTitle>
          <CardDescription>Gerencie suas informações e preferências.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar and photo upload button removed */}
          <div className="flex flex-col items-center space-y-2">
            <div className="w-24 h-24 border-2 border-primary rounded-full flex items-center justify-center bg-muted">
              {mockUser.name ? (
                <span className="text-3xl text-primary font-semibold">
                  {mockUser.name.charAt(0).toUpperCase()}
                </span>
              ) : (
                <UserCircle className="w-16 h-16 text-primary" />
              )}
            </div>
             <p className="text-sm text-muted-foreground">(Recurso de foto de perfil desativado)</p>
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
                <Button key={pref} variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/30 cursor-default">
                  {pref}
                </Button>
              ))}
               <Button variant="outline" className="border-primary text-primary hover:bg-primary/10">
                <Edit3 className="w-3 h-3 mr-1.5" /> Editar
              </Button>
            </div>
          </div>
          <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">Salvar Alterações</Button>
        </CardContent>
      </Card>
    </div>
  );
}

