import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function IndexPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (user.role === "platform_admin") {
    return <Redirect to="/platform" />;
  }

  return <Redirect to="/dashboard" />;
}
