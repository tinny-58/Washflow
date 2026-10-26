import React from "react";
import { Footer } from "@/components/shared/footer";

export default function FooterPagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-dvh">
      <div className="flex-1 flex flex-col">{children}</div>
      <Footer />
    </div>
  );
}
