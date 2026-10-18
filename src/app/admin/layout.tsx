import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import Link from "next/link";
import { LayoutDashboard, Tag, ShieldCheck, ArrowLeft } from "lucide-react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session || session.role !== "admin") {
    redirect("/login");
  }

  return (
    <div className="flex-1 flex flex-col w-full max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Admin Top Header Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Operations Console</h1>
            <p className="text-xs text-slate-300">
              Admin: <strong>{session.name}</strong> • Realtime WebSocket/SSE Active
            </p>
          </div>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5"
          >
            <LayoutDashboard className="w-4 h-4 text-sky-400" />
            <span>Orders & Map</span>
          </Link>

          <Link
            href="/admin/catalog"
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition flex items-center gap-1.5"
          >
            <Tag className="w-4 h-4 text-emerald-400" />
            <span>Price Catalog</span>
          </Link>

          <Link
            href="/"
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Storefront</span>
          </Link>
        </div>
      </div>

      <div className="flex-1">{children}</div>
    </div>
  );
}
