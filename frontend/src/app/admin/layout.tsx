import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session || session.role !== "admin") {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get("wf_sidebar_collapsed")?.value === "true";

  return (
    <AdminShell session={session} initialCollapsed={initialCollapsed}>
      {children}
    </AdminShell>
  );
}
