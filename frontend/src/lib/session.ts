import { cookies } from "next/headers";
import { UserSession } from "./types";

export const SESSION_COOKIE_NAME = "wf_session";

export async function getSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const token =
      cookieStore.get("wf_session")?.value ||
      cookieStore.get("__Host-wf_session")?.value;
    if (!token) return null;

    const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";
    const res = await fetch(`${backendUrl}/api/auth/me`, {
      headers: {
        Cookie: `wf_session=${token}; __Host-wf_session=${token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}
