
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
// Removed Avatar, AvatarFallback, AvatarImage imports
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Edit3, UserCircle } from 'lucide-react'; // Added UserCircle for placeholder

// Mock partner data updated
const mockPartner = {
  contactName: "Parceiro Fervo",
  email: "parceiro@fervo.com",
  companyName: "FervoTop Eventos Ltda.",
  // profilePictureUrl removed
  notificationsEnabled: true,
};

export default function PartnerSettingsPage() {
  return (
    <div className="container py-8 mx-auto">
      <Card className="max-w-2xl mx-auto border-destructive/70 shadow-lg shadow-destructive/20">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl text-destructive">Configurações da Conta</CardTitle>
          <CardDescription>Gerencie as informações e preferências da sua conta de parceiro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar and photo upload button removed */}
          <div className="flex flex-col items-center space-y-2">
             <div className="w-24 h-24 border-2 border-destructive rounded-full flex items-center justify-center bg-muted">
              {mockPartner.contactName ? (
                <span className="text-3xl text-destructive font-semibold">
                  {mockPartner.contactName.charAt(0).toUpperCase()}
                </span>
              ) : (
                <UserCircle className="w-16 h-16 text-destructive" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">(Recurso de foto de perfil desativado)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactName" className="text-destructive/90">Nome do Contato</Label>
            <Input id="contactName" defaultValue={mockPartner.contactName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyName" className="text-destructive/90">Nome da Empresa/Estabelecimento</Label>
            <Input id="companyName" defaultValue={mockPartner.companyName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-destructive/90">E-mail de Contato</Label>
            <Input id="email" type="email" defaultValue={mockPartner.email} />
          </div>
          
          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="notifications" className="text-destructive/90">Receber Notificações por E-mail</Label>
            <Switch id="notifications" defaultChecked={mockPartner.notificationsEnabled} className="data-[state=checked]:bg-destructive data-[state=unchecked]:bg-input"/>
          </div>

          <Button className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground">Salvar Alterações</Button>
        </CardContent>
      </Card>
    </div>
  );
}

