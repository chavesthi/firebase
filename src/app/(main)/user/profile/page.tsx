'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Edit3 } from 'lucide-react';

// Mock user data
const mockUser = {
  name: "Usuário Fervoso",
  email: "usuario@fervo.com",
  profilePictureUrl: "https://picsum.photos/seed/userprofile/100/100",
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
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="w-24 h-24 border-2 border-primary">
              <AvatarImage src={mockUser.profilePictureUrl} alt={mockUser.name} data-ai-hint="user avatar"/>
              <AvatarFallback className="text-3xl text-primary">{mockUser.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm" className="border-primary text-primary hover:bg-primary/10">
              <Edit3 className="w-4 h-4 mr-2" /> Alterar Foto
            </Button>
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
