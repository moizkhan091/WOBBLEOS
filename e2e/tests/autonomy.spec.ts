import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Earned-autonomy founder-facing control surface (real DB effects): a founder GRANTS a durable policy,
 * it shows as active in the inspection list, then a founder REVOKES it and it is no longer active.
 * The `test.action_*` category is isolated + cleaned up by the e2e fixture.
 */
async function policiesFor(request: APIRequestContext, category: string): Promise<Array<{ id: string; status: string; grantedLevel: string }>> {
  const res = await request.get(`/api/autonomy/policies?category=${encodeURIComponent(category)}`);
  const json = (await res.json()) as { policies?: Array<{ id: string; status: string; grantedLevel: string }> };
  return json.policies ?? [];
}

test.describe("Earned autonomy — grant → inspect → revoke (real effects)", () => {
  test("a founder can grant a durable autonomy policy, see it active, then revoke it", async ({ request }) => {
    const category = `e2e.autonomy.${Date.now()}`;

    // No policy yet.
    expect(await policiesFor(request, category)).toHaveLength(0);

    // Founder GRANTS a durable, earned autonomy policy.
    const create = await request.post("/api/autonomy/policies", { data: { category, grantedLevel: "autonomous", maxRiskLevel: "low" } });
    expect(create.status()).toBe(201);
    const created = (await create.json()) as { policy: { id: string } };
    const id = created.policy.id;

    // It is now visible + active in the founder inspection list.
    const active = await policiesFor(request, category);
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("active");
    expect(active[0].grantedLevel).toBe("autonomous");

    // Founder REVOKES it → no longer active (the action falls back to baseline).
    const revoke = await request.post(`/api/autonomy/policies/${id}/action`, { data: { action: "revoke" } });
    expect(revoke.ok()).toBe(true);
    const after = await policiesFor(request, category);
    expect(after.find((p) => p.id === id)?.status).toBe("revoked");
  });

  test("SOURCE ACTIVATION: a `source.activation` grant AUTO-ACTIVATES a new source (reversible → a grant releases it); no grant → pending", async ({ request }) => {
    const stamp = Date.now();
    const grantedClient = `e2e_srcauto_g_${stamp}`, ungrantedClient = `e2e_srcauto_u_${stamp}`;

    // Founder grants source.activation autonomy scoped to ONE client.
    const grant = await request.post("/api/autonomy/policies", { data: { category: "source.activation", grantedLevel: "autonomous", clientId: grantedClient, maxRiskLevel: "low" } });
    expect(grant.status()).toBe(201);

    // A source added for the GRANTED client AUTO-ACTIVATES (skips the founder approval).
    const s1 = await request.post("/api/sources", { data: { title: `E2E granted src ${stamp}`, sourceType: "url", ownerScope: "client", ownerId: grantedClient } });
    expect(s1.status()).toBe(201);
    const b1 = (await s1.json()) as { autoActivated?: boolean; source: { approvalStatus: string } };
    expect(b1.autoActivated).toBe(true);
    expect(b1.source.approvalStatus).toBe("approved");

    // A source for a DIFFERENT client (no grant) stays PENDING — tenant-scoped, never silently activated.
    const s2 = await request.post("/api/sources", { data: { title: `E2E ungranted src ${stamp}`, sourceType: "url", ownerScope: "client", ownerId: ungrantedClient } });
    expect(s2.status()).toBe(201);
    const b2 = (await s2.json()) as { autoActivated?: boolean; source: { approvalStatus: string } };
    expect(b2.autoActivated ?? false).toBe(false);
    expect(b2.source.approvalStatus).toBe("pending");
  });
});
