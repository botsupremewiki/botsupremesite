import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { SLOT_MACHINES, type SlotMachineId } from "@shared/types";
import { SlotsClient } from "./slots-client";

export const dynamic = "force-dynamic";

export default async function SlotsMachinePage({
  params,
}: {
  params: Promise<{ machineId: string }>;
}) {
  const { machineId } = await params;
  if (!(machineId in SLOT_MACHINES)) notFound();
  const profile = await getProfile();
  return (
    <SlotsClient
      profile={profile}
      machineId={machineId as SlotMachineId}
    />
  );
}
