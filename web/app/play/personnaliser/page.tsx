import { redirect } from "next/navigation";

// Ancienne page : la customisation a été fusionnée dans /play/profil pour
// regrouper en un seul endroit tout ce qui touche à l'identité du joueur.
// On garde un redirect pour ne pas casser les anciens liens partagés.
export default function PersonnaliserRedirect(): never {
  redirect("/play/profil");
}
