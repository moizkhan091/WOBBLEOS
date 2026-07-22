import { describe, expect, it } from "vitest";
import { MODULES, matchModules, scoreModuleMatch, listNavModules, MODULE_MATCH_SCORES, type ModuleDef } from "@/lib/os/modules";

/**
 * Command palette (Cmd+K) — the PURE matching half.
 *
 * The palette matches modules locally on every keystroke so navigation is instant and keeps working
 * when the DB or network is down. That makes this function the thing standing between the founder and
 * "the search box does nothing", so it is pinned down here: ranking, case-insensitivity, the empty
 * query, and — the one that actually crashes real palettes — regex metacharacters typed by a human.
 */

const ALL: ModuleDef[] = listNavModules().map((m) => m.mod);

function ids(mods: ModuleDef[]): string[] {
  return mods.map((m) => m.id);
}

describe("matchModules", () => {
  it("ranks an exact id match first", () => {
    // "crm" is also a substring of other labels; the module whose ID IS "crm" must still win.
    expect(matchModules("crm", ALL)[0]?.id).toBe("crm");
    expect(matchModules("ask", ALL)[0]?.id).toBe("ask");
    expect(matchModules("media", ALL)[0]?.id).toBe("media");
  });

  it("ranks an exact id above a module that merely contains those letters", () => {
    const scoreExact = scoreModuleMatch("audit", MODULES.audit);
    const scoreContains = scoreModuleMatch("audit", MODULES.paid_audit);
    expect(scoreExact).toBe(MODULE_MATCH_SCORES.idExact);
    expect(scoreContains).toBeLessThan(scoreExact);
    expect(matchModules("audit", ALL)[0]?.id).toBe("audit");
  });

  it("matches on a label substring, not just the id", () => {
    // Nothing has the id "pipeline" — this can only be found through crm's label "Pipeline / CRM".
    const found = ids(matchModules("pipeline", ALL));
    expect(found).toContain("crm");
    // "Decision Room" is reachable by a word from the middle of its label.
    expect(ids(matchModules("room", ALL))).toContain("decision");
  });

  it("is case-insensitive in both directions", () => {
    expect(ids(matchModules("CRM", ALL))).toEqual(ids(matchModules("crm", ALL)));
    expect(ids(matchModules("Daily Brief", ALL))).toContain("brief");
    expect(ids(matchModules("dAiLy BrIeF", ALL))).toContain("brief");
    expect(scoreModuleMatch("MEDIA", MODULES.media)).toBe(scoreModuleMatch("media", MODULES.media));
  });

  it("ignores surrounding whitespace", () => {
    expect(matchModules("  crm  ", ALL)[0]?.id).toBe("crm");
  });

  it("returns nothing for an empty or whitespace-only query", () => {
    // The palette's resting state is an invitation to type, not a dump of the whole sidebar.
    expect(matchModules("", ALL)).toEqual([]);
    expect(matchModules("   ", ALL)).toEqual([]);
    expect(matchModules("\t\n", ALL)).toEqual([]);
    expect(scoreModuleMatch("", MODULES.crm)).toBe(0);
  });

  it("does not crash on regex metacharacters", () => {
    // A founder half-typing "(q1" would blow up any implementation that did `new RegExp(query)`.
    for (const q of ["(", ")", "*", "+", "?", "[", "]", "{", "}", "^", "$", "|", ".", "\\", "(*", "a[b", "c**d", "\\\\"]) {
      expect(() => matchModules(q, ALL), `query ${JSON.stringify(q)} threw`).not.toThrow();
      expect(Array.isArray(matchModules(q, ALL))).toBe(true);
    }
  });

  it("treats metacharacters as literal characters, matching nothing that does not contain them", () => {
    expect(matchModules("*", ALL)).toEqual([]);
    expect(matchModules(".*", ALL)).toEqual([]);
    // But a real literal underscore in an id still matches, because nothing is treated as a wildcard.
    expect(ids(matchModules("free_audit", ALL))).toContain("free_audit");
  });

  it("returns no match for a query that matches nothing", () => {
    expect(matchModules("zzzzqqqqxxxx", ALL)).toEqual([]);
  });

  it("supports fuzzy subsequence matching for at-least-two characters", () => {
    // "cmd" is not a substring of "command" but every letter appears in order.
    expect(ids(matchModules("cmd", ALL))).toContain("command");
    const fixture: ModuleDef = { id: "abc", label: "Alpha Beta", title: "", icon: "", tagline: "", status: "wired" };
    // "ah" is a subsequence of "alphabeta" (label, spaces stripped) but a substring of nothing.
    expect(scoreModuleMatch("ah", fixture)).toBe(MODULE_MATCH_SCORES.subsequence);
    // …and it ranks BELOW every literal match, so fuzzy hits only ever fill the tail of the list.
    expect(MODULE_MATCH_SCORES.subsequence).toBeLessThan(MODULE_MATCH_SCORES.labelSubstring);
    // A character present in neither id nor label matches nothing at all.
    expect(scoreModuleMatch("z", fixture)).toBe(0);
  });

  it("caps the number of results", () => {
    // "a" is a substring of many labels; the palette must not render a wall of them.
    expect(matchModules("a", ALL, 5).length).toBeLessThanOrEqual(5);
    expect(matchModules("a", ALL).length).toBeLessThanOrEqual(8);
  });

  it("preserves sidebar order between equally-scored matches (stable sort)", () => {
    const mods: ModuleDef[] = [
      { id: "alpha", label: "Zeta thing", title: "", icon: "", tagline: "", status: "wired" },
      { id: "beta", label: "Zeta other", title: "", icon: "", tagline: "", status: "wired" },
    ];
    // Both match "zeta" as a label prefix — identical score, so the caller's order decides.
    expect(ids(matchModules("zeta", mods))).toEqual(["alpha", "beta"]);
    expect(ids(matchModules("zeta", [mods[1], mods[0]]))).toEqual(["beta", "alpha"]);
  });

  it("never returns a module that scores zero", () => {
    for (const mod of matchModules("con", ALL)) {
      expect(scoreModuleMatch("con", mod)).toBeGreaterThan(0);
    }
  });
});

describe("listNavModules", () => {
  it("returns every sidebar module tagged with its group", () => {
    const nav = listNavModules();
    expect(nav.length).toBeGreaterThan(30);
    for (const entry of nav) {
      expect(entry.group.length).toBeGreaterThan(0);
      expect(MODULES[entry.mod.id]).toBe(entry.mod);
    }
    expect(nav.find((n) => n.mod.id === "crm")?.group).toBe("REVENUE / CRM");
  });

  it("has no duplicate ids — a duplicated palette row would be a registry bug", () => {
    const seen = listNavModules().map((n) => n.mod.id);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
