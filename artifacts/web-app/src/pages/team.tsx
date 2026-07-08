import { useAuth } from "@/hooks/use-auth";
import { useListUsers, useUpdateUser, useDeleteUser , getListUsersQueryKey} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Users, MoreHorizontal, UserX, UserCheck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

export default function TeamPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: users = [], isLoading } = useListUsers({ query: { enabled: !!user , queryKey: getListUsersQueryKey() } });
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";

  const handleUpdateStatus = (id: number, status: 'active' | 'inactive', targetRole: string) => {
    if (isManager && (targetRole === "admin")) {
      toast({ title: "Permission denied", description: "Managers cannot deactivate admin accounts.", variant: "destructive" });
      return;
    }
    updateUser.mutate({ id, data: { status } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() })
    });
  };

  const handleUpdateRole = (id: number, role: 'admin' | 'manager' | 'employee') => {
    updateUser.mutate({ id, data: { role } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() })
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to remove this user?")) {
      deleteUser.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() })
      });
    }
  };

  if (user?.role === 'employee') {
    return <div>Access Denied</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-4xl font-bold font-sans tracking-tight text-foreground">Team Members</h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">Manage your staff</p>
      </div>

      <Card className="border-border/50 shadow-md bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <CardTitle>Directory</CardTitle>
          </div>
          <CardDescription>View and manage all employees in your company.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Name</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Contact</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Role</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : users.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No team members found.</TableCell></TableRow>
                ) : (
                  users.map((member) => {
                    const isOwnAccount = member.id === user?.id;
                    const targetIsAdmin = member.role === "admin";
                    const canManage = isAdmin || (!targetIsAdmin && isManager);
                    return (
                      <TableRow key={member.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-semibold">{member.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{member.hourlyRate ? `$${member.hourlyRate}/hr` : 'Salary'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{member.email}</div>
                          <div className="text-xs text-muted-foreground">{member.phone || '-'}</div>
                        </TableCell>
                        <TableCell>
                          <Select
                            disabled={isOwnAccount || !isAdmin}
                            value={member.role}
                            onValueChange={(val: any) => handleUpdateRole(member.id, val)}
                          >
                            <SelectTrigger className="w-[120px] h-8 text-xs font-mono">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="employee">Employee</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs font-mono border ${member.status === 'active' ? 'bg-accent/10 text-accent-foreground border-accent/20' : 'bg-muted text-muted-foreground border-border'}`}>
                            {member.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {!isOwnAccount && isAdmin ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {member.status === 'active' ? (
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(member.id, 'inactive', member.role)}>
                                    <UserX className="w-4 h-4 mr-2" /> Deactivate
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(member.id, 'active', member.role)}>
                                    <UserCheck className="w-4 h-4 mr-2" /> Activate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleDelete(member.id)} className="text-destructive">
                                  <UserX className="w-4 h-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
