import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { ensureSkylineProfile } from "../_lib/supabase-helpers";
import { SkylineHeader } from "../_components/skyline-header";
import { JobView } from "./job-view";

export const dynamic = "force-dynamic";

export default async function JobPage() {
  const profile = await getProfile();
  if (!profile) redirect("/play");

  const skyProfile = await ensureSkylineProfile();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkylineHeader
        profile={profile}
        cash={Number(skyProfile?.cash ?? 0)}
        subtitle="Salariat"
        backHref="/play/skyline"
        backLabel="Skyline"
      />
      <JobView
        isSeeking={skyProfile?.is_seeking_job ?? false}
        minSalary={Number(skyProfile?.job_min_salary ?? 2000)}
        currentJobCompanyId={skyProfile?.current_job_company_id ?? null}
        currentJobSalary={
          skyProfile?.current_job_salary
            ? Number(skyProfile.current_job_salary)
            : null
        }
        currentJobStartedAt={skyProfile?.current_job_started_at ?? null}
        playerSkills={
          (skyProfile?.player_skills as Record<string, number> | null) ?? {}
        }
      />
    </div>
  );
}
