import { useAuth } from "@/hooks/use-auth";
import { useGetCompany, useUpdateCompany, useUpdateUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Building, User } from "lucide-react";

const profileSchema = z.object({
  name: z.string().min(2, "Name required"),
  phone: z.string().optional().nullable(),
});

const companySchema = z.object({
  name: z.string().min(2, "Name required"),
  address: z.string().optional().nullable(),
  timezone: z.string().min(1, "Timezone required"),
  overtimeThreshold: z.string().min(1, "Threshold required"),
});

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const updateUser = useUpdateUser();
  const updateCompany = useUpdateCompany();

  // If user is admin/manager, fetch company settings
  const { data: company, isLoading: companyLoading } = useGetCompany(user?.companyId || 0, { 
    query: { enabled: !!user && !!user.companyId && user.role === 'admin', queryKey: ['/api/companies', user?.companyId || 0] } 
  });

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", phone: "" },
  });

  const companyForm = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: "", address: "", timezone: "UTC", overtimeThreshold: "40:00:00" },
  });

  useEffect(() => {
    if (user) {
      profileForm.reset({ name: user.name, phone: user.phone });
    }
  }, [user, profileForm]);

  useEffect(() => {
    if (company) {
      companyForm.reset({ 
        name: company.name, 
        address: company.address, 
        timezone: company.timezone, 
        overtimeThreshold: company.overtimeThreshold 
      });
    }
  }, [company, companyForm]);

  function onProfileSubmit(values: z.infer<typeof profileSchema>) {
    if (!user) return;
    updateUser.mutate({ id: user.id, data: values }, {
      onSuccess: () => {
        toast({ title: "Profile updated" });
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      }
    });
  }

  function onCompanySubmit(values: z.infer<typeof companySchema>) {
    if (!company) return;
    updateCompany.mutate({ id: company.id, data: values }, {
      onSuccess: () => {
        toast({ title: "Company updated" });
        queryClient.invalidateQueries({ queryKey: ['/api/companies', company.id] });
      }
    });
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div>
        <h1 className="text-4xl font-bold font-sans tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">Manage your preferences</p>
      </div>

      <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            <CardTitle>Personal Profile</CardTitle>
          </div>
          <CardDescription>Update your personal information.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={profileForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={updateUser.isPending}>
                  {updateUser.isPending ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {user?.role === 'admin' && company && !companyLoading && (
        <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur border-t-4 border-t-primary">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building className="w-5 h-5 text-primary" />
              <CardTitle>Company Settings</CardTitle>
            </div>
            <CardDescription>Manage organization-wide configurations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...companyForm}>
              <form onSubmit={companyForm.handleSubmit(onCompanySubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={companyForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={companyForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={companyForm.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Timezone</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={companyForm.control}
                    name="overtimeThreshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Overtime Threshold</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} placeholder="40:00:00" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={updateCompany.isPending}>
                    {updateCompany.isPending ? "Saving..." : "Save Company"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
