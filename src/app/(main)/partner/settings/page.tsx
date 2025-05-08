
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Edit3, UserCircle, Moon, Sun } from 'lucide-react'; // Added Moon, Sun
import { useTheme } from '@/contexts/theme-provider'; // Added useTheme
import { Separator } from '@/components/ui/separator';

// Mock partner data updated
const mockPartner = {
  contactName: "Parceiro Fervo",
  email: "parceiro@fervo.com",
  companyName: "FervoTop Eventos Ltda.",
  notificationsEnabled: true,
};

export default function PartnerSettingsPage() {
  const { theme, setTheme, toggleTheme } = useTheme(); // Theme hook

  return (
    <div className="container py-6 sm:py-8 mx-auto px-4">
      <Card className="max-w-2xl mx-auto border-destructive/70 shadow-lg shadow-destructive/20">
        <CardHeader className="text-center p-4 sm:p-6">
          <CardTitle className="text-2xl sm:text-3xl text-destructive">Configurações da Conta</CardTitle>
          <CardDescription className="text-sm sm:text-base">Gerencie as informações e preferências da sua conta de parceiro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
          <div className="flex flex-col items-center space-y-2">
             <div className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-destructive rounded-full flex items-center justify-center bg-muted">
              {mockPartner.contactName ? (
                <span className="text-2xl sm:text-3xl text-destructive font-semibold">
                  {mockPartner.contactName.charAt(0).toUpperCase()}
                </span>
              ) : (
                <UserCircle className="w-14 h-14 sm:w-16 sm:h-16 text-destructive" />
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">(Recurso de foto de perfil desativado)</p>
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
            <Label htmlFor="notifications" className="text-destructive/90 text-sm sm:text-base">Receber Notificações por E-mail</Label>
            <Switch id="notifications" defaultChecked={mockPartner.notificationsEnabled} className="data-[state=checked]:bg-destructive data-[state=unchecked]:bg-input"/>
          </div>

          <Separator className="my-6 bg-destructive/30" />

           <div className="space-y-2">
                <h3 className="text-lg font-medium text-destructive/90">Configurações de Tema</h3>
                <div className="flex items-center justify-between rounded-lg border border-input p-3 shadow-sm">
                    <div className="space-y-0.5">
                        <Label htmlFor="dark-mode-switch-partner" className="text-base text-destructive/80">
                            Modo Noturno
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            Ative para uma experiência visual escura.
                        </p>
                    </div>
                    <Switch
                        id="dark-mode-switch-partner"
                        checked={theme === 'dark'}
                        onCheckedChange={toggleTheme}
                        aria-label="Alternar modo noturno"
                        className="data-[state=checked]:bg-destructive data-[state=unchecked]:bg-input"
                    />
                </div>
            </div>


          <Button className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm sm:text-base">Salvar Alterações</Button>
        </CardContent>
      </Card>
    </div>
  );
}
