import { redirect } from "next/navigation";

export default function ClientAddressesPage() {
  redirect("/client/settings?tab=addresses");
}
