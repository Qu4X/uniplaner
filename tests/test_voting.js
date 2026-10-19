const assert = require("assert");
const path = require("path");
const VotingModule = require(path.join(__dirname, "../web/js/modules/voting.js"));

console.log("\n🧪 Running Voting Module Tests...\n");

// Mock localStorage
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => {
    mockStorage[key] = String(val);
  },
  removeItem: (key) => {
    delete mockStorage[key];
  },
  clear: () => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  }
};

// 1. Voter Token
{
  mockStorage["sggw_weta_voter_token"] = "existing-token-123";
  const token = VotingModule.getVoterToken("sggw_weta");
  assert.strictEqual(token, "existing-token-123", "Powinno zwrócić istniejący token z localStorage");

  const newToken = VotingModule.getVoterToken("umg_wn");
  assert.ok(newToken && newToken.length > 10, "Powinno wygenerować nowy token UUID");
  assert.strictEqual(mockStorage["umg_wn_voter_token"], newToken, "Nowy token powinien być zapisany");
}

// 2. Fetch Proposals
(async () => {
  let calledUrl = "";
  let calledHeaders = {};
  const mockFetch = async (url, opts) => {
    calledUrl = url;
    calledHeaders = opts.headers;
    return {
      ok: true,
      json: async () => [{ id: "prop-1", subject: "Matematyka", status: "pending" }]
    };
  };

  const proposals = await VotingModule.fetchProposals({
    tenantId: "sggw_weta",
    planId: "vet_rok_1",
    groupName: "GR_1",
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key-xyz",
    customFetch: mockFetch
  });

  assert.strictEqual(proposals.length, 1);
  assert.strictEqual(proposals[0].id, "prop-1");
  assert.ok(calledUrl.includes("tenant_id=eq.sggw_weta"));
  assert.ok(calledUrl.includes("plan_id=eq.vet_rok_1"));
  assert.strictEqual(calledHeaders.apikey, "anon-key-xyz");
  assert.strictEqual(calledHeaders.Authorization, "Bearer anon-key-xyz");
})().catch((err) => {
  console.error("Test fetchProposals failed:", err);
  process.exit(1);
});

// 3. Submit Proposal & RLS Status constraint
(async () => {
  let postBody = null;
  const mockFetch = async (url, opts) => {
    postBody = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({ id: "new-prop-uuid", ...postBody })
    };
  };

  const res = await VotingModule.submitProposal(
    {
      tenant_id: "sggw_weta",
      plan_id: "vet_rok_1",
      group_name: "GR_1",
      lesson_id: "lesson-sha256",
      subject: "Anatomia",
      scope: "permanent",
      original_day_of_week: "MON",
      original_start_time: "08:00",
      original_end_time: "09:30",
      new_day_of_week: "TUE",
      new_start_time: "10:00",
      new_end_time: "11:30",
      reason: "Przeniesienie na wniosek starosty",
      plan_version_token: "v-token-1"
    },
    {
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon-key-xyz",
      customFetch: mockFetch
    }
  );

  assert.strictEqual(res.id, "new-prop-uuid");
  assert.strictEqual(postBody.status, "pending", "Propozycja musi mieć status pending (wymóg RLS)");
  assert.strictEqual(postBody.votes_count, 0, "Propozycja musi startować z 0 głosami (wymóg RLS)");
  assert.strictEqual(postBody.new_day_of_week, "TUE");
})().catch((err) => {
  console.error("Test submitProposal failed:", err);
  process.exit(1);
});

// 4. Runtime Overlay (Permanent & Single)
{
  const mockSchedule = {
    plan_id: "plan_1",
    group: "GR 1",
    lessons: [
      {
        id: "l1",
        subject: "Biochemia",
        day_of_week: "MON",
        start_time: "08:00",
        end_time: "09:30",
        room: "Aula A",
        occurrences: [
          { date: "2026-10-05", start_time: "08:00", end_time: "09:30", room: "Aula A" },
          { date: "2026-10-12", start_time: "08:00", end_time: "09:30", room: "Aula A" }
        ]
      },
      {
        id: "l2",
        subject: "Fizjologia",
        day_of_week: "WED",
        start_time: "12:00",
        end_time: "13:30",
        room: "Lab 3",
        occurrences: [
          { date: "2026-10-07", start_time: "12:00", end_time: "13:30", room: "Lab 3" },
          { date: "2026-10-14", start_time: "12:00", end_time: "13:30", room: "Lab 3" }
        ]
      }
    ]
  };

  const proposals = [
    {
      id: "p1",
      lesson_id: "l1",
      status: "approved",
      scope: "permanent",
      new_day_of_week: "FRI",
      new_start_time: "14:00",
      new_end_time: "15:30",
      new_room: "Aula B",
      reason: "Przeniesiono na stałe",
      plan_version_token: "tok1"
    },
    {
      id: "p2",
      lesson_id: "l2",
      status: "approved",
      scope: "single",
      target_date: "2026-10-07",
      new_day_of_week: "THU",
      new_start_time: "10:00",
      new_end_time: "11:30",
      new_room: "Lab 4",
      reason: "Jednorazowa zmiana",
      plan_version_token: "tok1"
    },
    {
      id: "p3_expired",
      lesson_id: "l2",
      status: "approved",
      scope: "permanent",
      new_day_of_week: "FRI",
      new_start_time: "16:00",
      new_end_time: "17:30",
      plan_version_token: "old-tok"
    },
    {
      id: "p4_pending",
      lesson_id: "l2",
      status: "pending",
      scope: "permanent",
      new_day_of_week: "FRI",
      new_start_time: "18:00",
      new_end_time: "19:30"
    }
  ];

  const updatedSchedule = VotingModule.applyProposalOverlay(mockSchedule, proposals, "tok1");

  // l1 (permanent change)
  const l1Updated = updatedSchedule.lessons.find((l) => l.id === "l1");
  assert.strictEqual(l1Updated.day_of_week, "FRI", "Dzień l1 powinien zmienić się na FRI");
  assert.strictEqual(l1Updated.start_time, "14:00");
  assert.strictEqual(l1Updated.end_time, "15:30");
  assert.strictEqual(l1Updated.room, "Aula B");
  assert.strictEqual(l1Updated.occurrences[0].room, "Aula B");

  // l2 (single change on 2026-10-07)
  const l2Original = updatedSchedule.lessons.find((l) => l.id === "l2");
  assert.strictEqual(l2Original.occurrences.length, 1, "Wystąpienie 2026-10-07 powinno zostać odłączone");
  assert.strictEqual(l2Original.occurrences[0].date, "2026-10-14");

  const l2SingleOverride = updatedSchedule.lessons.find((l) => l.id === "l2_override_2026-10-07");
  assert.ok(l2SingleOverride, "Powinna powstać jednorazowa lekcja dla przeniesionego terminu");
  assert.strictEqual(l2SingleOverride.day_of_week, "THU");
  assert.strictEqual(l2SingleOverride.start_time, "10:00");
  assert.strictEqual(l2SingleOverride.room, "Lab 4");

  // p3_expired should NOT be applied because token "old-tok" != "tok1"
  assert.notStrictEqual(l2Original.day_of_week, "FRI", "Wygasła propozycja z poprzedniej wersji nie powinna być aplikowana");
  // p4_pending should NOT be applied
  assert.notStrictEqual(l2Original.start_time, "18:00", "Propozycja pending nie może być aplikowana");

  console.log("✅ All Voting Module tests passed successfully!\n");
}
