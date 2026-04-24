import { getProfile } from "@/lib/auth";
import { isAuthConfigured } from "@/lib/supabase/server";
import { SignInButton } from "./sign-in-button";
import { UserPill } from "./user-pill";

export async function UserMenu({
  variant = "nav",
}: {
  variant?: "nav" | "play";
}) {
  if (!isAuthConfigured()) return null;

  const profile = await getProfile();
  if (!profile) return <SignInButton />;

  return <UserPill profile={profile} variant={variant} />;
}
