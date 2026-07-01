import { redirect } from "next/navigation";

// The real dashboard lives under /[module] (e.g. /command, /approvals).
// Root redirects into the Command Center.
export default function Home() {
  redirect("/command");
}
