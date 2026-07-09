// Personality greeting — pure domain. Time-of-day + founder-name aware, with
// enough variety that the OS feels alive. No IO; deterministic given (hour, name, pick).
//
// The founders (per CLAUDE.md): Moiz, Ali, Ibrahim, Haad.

export type DayPart = "late_night" | "early_morning" | "morning" | "afternoon" | "evening" | "night";

export function dayPartForHour(hour: number): DayPart {
  if (hour >= 0 && hour < 5) return "late_night";
  if (hour >= 5 && hour < 8) return "early_morning";
  if (hour >= 8 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night"; // 21-24
}

// Greeting templates per day part. `{name}` is replaced with the founder's first name.
// Deliberately varied — some straight, some cheeky — so it never feels canned.
const GREETINGS: Record<DayPart, string[]> = {
  late_night: [
    "Late night grind, {name}?",
    "Burning the midnight oil, {name}",
    "Still up, {name}? Respect.",
    "The city's asleep. WOBBLE isn't. Hey {name}.",
    "3am ideas hit different, {name}",
    "Can't sleep, {name}? Let's build.",
  ],
  early_morning: [
    "Early bird, {name} 🌅",
    "Up before the sun, {name}?",
    "Morning has broken, {name}",
    "Fresh start, {name}. Let's go.",
    "Rise and grind, {name}",
  ],
  morning: [
    "Good morning, {name} ☀️",
    "Morning, {name}",
    "Hola {name}, ready to build?",
    "Top of the morning, {name}",
    "Let's make today count, {name}",
    "Coffee in, {name}? Let's move.",
  ],
  afternoon: [
    "Good afternoon, {name}",
    "Afternoon, {name} — how's it flowing?",
    "Midday momentum, {name}",
    "Hey {name}, powering through?",
    "Hola {name}",
  ],
  evening: [
    "Good evening, {name}",
    "Evening, {name}",
    "Winding down or winding up, {name}?",
    "Golden hour, {name}",
    "Hey {name}, still shipping?",
  ],
  night: [
    "Good night's work ahead, {name}?",
    "Evening grind, {name}",
    "Night shift, huh {name}?",
    "The quiet hours, {name}. Deep work time.",
    "Hey {name}, one more push?",
  ],
};

// A rotating subline under the greeting — light, WOBBLE-flavored.
const SUBLINES: string[] = [
  "What are we building today?",
  "Ask me anything, or point me at a client.",
  "The whole OS is one message away.",
  "Drop a file, ask a question, run a workflow.",
  "Your AI workforce is standing by.",
  "Let's turn a lead into revenue.",
  "Where do you want to start?",
];

export interface GreetingInput {
  founder?: string | null;
  hour: number; // 0-23, in the founder's local time
  pick?: number; // 0..1 deterministic selector (defaults handled by caller)
}

export interface Greeting {
  dayPart: DayPart;
  greeting: string;
  subline: string;
  name: string;
}

function firstName(founder?: string | null): string {
  if (!founder) return "there";
  const trimmed = founder.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

/** Build a greeting. `pick` in [0,1) selects the variant deterministically (caller supplies randomness). */
export function buildGreeting(input: GreetingInput): Greeting {
  const name = firstName(input.founder);
  const dayPart = dayPartForHour(((input.hour % 24) + 24) % 24);
  const pool = GREETINGS[dayPart];
  const p = Math.min(Math.max(input.pick ?? 0, 0), 0.999999);
  const greeting = pool[Math.floor(p * pool.length)].replace(/\{name\}/g, name);
  const subline = SUBLINES[Math.floor(p * SUBLINES.length)];
  return { dayPart, greeting, subline, name };
}
