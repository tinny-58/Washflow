"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Smartphone, Zap, MessageSquare } from "lucide-react";

export function WhatsAppNav() {
  const pathname = usePathname();

  const tabs = [
    {
      title: "Worker & Sender",
      href: "/admin/whatsapp/worker",
      icon: Smartphone,
    },
    {
      title: "Automations & Templates",
      href: "/admin/whatsapp/automations",
      icon: Zap,
    },
    {
      title: "Message Logs & Queue",
      href: "/admin/whatsapp/logs",
      icon: MessageSquare,
    },
  ];

  return (
    <div className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 border ${
              isActive
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                : "bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? "text-emerald-400" : "text-slate-400"}`} />
            <span>{tab.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
