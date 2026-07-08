import { useAuth } from "@/hooks/use-auth";
import { useListInvitations, useCreateInvitation, useDeleteInvitation , getListInvitationsQueryKey} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Trash2, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const invitationSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(['admin', 'manager', 'employee']),
});

export default function InvitationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: invitations = [], isLoading } = useListInvitations({ query: { enabled: !!user , queryKey: getListInvitationsQueryKey() } });
  const createInvitation = useCreateInvitation();
  const deleteInvitation = useDeleteInvitation();
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof invitationSchema>>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { email: "", role: "employee" },
  });

  if (user?.role === 'employee') return <div>Access Denied</div>;

  function onSubmit(values: z.infer<typeof invitationSchema>) {
    createInvitation.mutate({ data: values }, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ['/api/invitations'] });
        toast({ title: "Invitation sent" });
      }
    });
  }

  const handleDelete = (id: number) => {
    if (confirm("Revoke this invitation?")) {
      deleteInvitation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/api/invitations'] });
          toast({ title: "Invitation revoked" });
        }
      });
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast({ title: "Token copied to clipboard" });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold font-sans tracking-tight text-foreground">Invitations</h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">Grow your team</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="font-semibold"><Plus className="w-4 h-4 mr-2" /> Invite User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Invitation</DialogTitle>
              <DialogDescription>Invite a new user to join your company.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="name@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createInvitation.isPending}>
                    {createInvitation.isPending ? "Sending..." : "Send Invite"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <CardTitle>Pending Invitations</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Email</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Role</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Token</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : invitations.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No pending invitations.</TableCell></TableRow>
                ) : (
                  invitations.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell className="capitalize">{inv.role}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs font-mono border ${inv.status === 'pending' ? 'bg-accent/10 text-accent-foreground border-accent/20' : 'bg-muted text-muted-foreground border-border'}`}>
                          {inv.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded">{inv.token}</code>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToken(inv.token)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(inv.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
