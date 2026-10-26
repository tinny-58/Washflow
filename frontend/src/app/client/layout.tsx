import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { ClientShell } from "@/components/client/client-shell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // If user is admin, they belong in /admin
  if (session.role === "admin") {
    redirect("/admin");
  }

  const cookieStore = await cookies();
  const initialCollapsed =
    cookieStore.get("wf_client_sidebar_collapsed")?.value === "true";

  return (
    <ClientShell session={session} initialCollapsed={initialCollapsed}>
      {children}
    </ClientShell>
  );
}
