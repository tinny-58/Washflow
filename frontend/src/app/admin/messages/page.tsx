import { redirect } from "next/navigation";

export default function AdminMessagesRedirectPage() {
  redirect("/admin/whatsapp/logs");
}
