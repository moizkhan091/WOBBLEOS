import { redirect } from "next/navigation";

// The real dashboard lives under /[module] (e.g. /ask, /command).
// Root redirects into Ask WOBBLE — the first "center" (Command is second).
export default function Home() {
  redirect("/ask");
}
