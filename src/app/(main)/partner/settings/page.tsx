'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Edit3 } from 'lucide-react';

// Mock partner data
const mockPartner = {
  contactName: "Parceiro Fervo",
  email: "parceiro@fervo.com",
  companyName: "FervoTop Eventos Ltda.",
  profilePictureUrl: "https://picsum.photos/seed/partnersettings/100/100",
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
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="w-24 h-24 border-2 border-destructive">
              <AvatarImage src={mockPartner.profilePictureUrl} alt={mockPartner.contactName} data-ai-hint="partner avatar" />
              <AvatarFallback className="text-3xl text-destructive">{mockPartner.contactName.charAt(0)}</AvatarFallback>
            </Avatar>
             <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10">
              <Edit3 className="w-4 h-4 mr-2" /> Alterar Foto
            </Button>
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
