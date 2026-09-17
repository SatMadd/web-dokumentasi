import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const vars = Object.fromEntries(
  env
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.trim().split("="))
);

const supabaseUrl = vars.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = vars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = vars.SUPABASE_SERVICE_ROLE_KEY;

const sbAdmin = createClient(supabaseUrl, serviceRoleKey);

async function login(email, password = "KOMINFO2026") {
  const sb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { sb, user: data.user };
}

async function runTests() {
  console.log("=================================================");
  console.log("TESTING HEAD-EDITABLE TASK ASSIGNEES FEATURE");
  console.log("=================================================");

  // 1. Fetch user accounts
  const { data: profiles } = await sbAdmin.from("profiles").select("*");
  const heads = profiles.filter((p) => p.role === "head");
  const members = profiles.filter((p) => p.role === "member");

  const headAProfile = heads.find((h) => h.full_name?.toLowerCase().includes("suprapto")) || heads[0];
  const headBProfile = heads.find((h) => h.id !== headAProfile.id) || heads[1];

  const memberX = members[0]; // e.g. Budi
  const memberY = members[1]; // e.g. Siti
  const memberZ = members[2]; // e.g. Ahmad

  console.log("Head A (Creator):", headAProfile.full_name, `(${headAProfile.id})`);
  console.log("Head B (Editor):", headBProfile.full_name, `(${headBProfile.id})`);
  console.log("Member X:", memberX.full_name, `(${memberX.id})`);
  console.log("Member Y:", memberY.full_name, `(${memberY.id})`);
  console.log("Member Z:", memberZ.full_name, `(${memberZ.id})`);

  // Login as Head A, Head B, Member X
  const { sb: sbHeadA, user: userHeadA } = await login("suprapto@door.id");
  const { sb: sbHeadB, user: userHeadB } = await login(
    headBProfile.full_name?.toLowerCase().includes("hendra") ? "hendra@door.id" : "dewi@door.id"
  );
  const { sb: sbMemberX, user: userMemberX } = await login("budi@door.id");

  console.log("\n--- TEST 1 & 2: Head A creates task; Head B edits assignees (removes Y, adds Z) ---");
  
  // Step 1: Head A creates a task with assignees X and Y
  const { data: task1, error: t1Err } = await sbHeadA
    .from("tasks")
    .insert({
      title: "Task Assignee Edit QA Test",
      planned_location: "Ruang Rapat Utama",
      scheduled_start: new Date().toISOString(),
      status: "pending",
      created_by: userHeadA.id,
    })
    .select()
    .single();

  if (t1Err) throw new Error("Task 1 insert failed: " + t1Err.message);
  console.log("✅ Head A created task:", task1.id, "Status:", task1.status);

  // Assign X and Y
  const { error: as1Err } = await sbHeadA.from("task_assignees").insert([
    { task_id: task1.id, user_id: memberX.id },
    { task_id: task1.id, user_id: memberY.id },
  ]);
  if (as1Err) throw new Error("Assignees insert failed: " + as1Err.message);
  console.log("✅ Assigned Member X and Member Y");

  // Notifications for initial assignees ('tugas', 'baru')
  await sbHeadA.from("notifications").insert([
    {
      user_id: memberX.id,
      category: "tugas",
      detail: "baru",
      reference_id: task1.id,
      message: `Anda telah ditugaskan ke: ${task1.title}`,
      is_read: false,
    },
    {
      user_id: memberY.id,
      category: "tugas",
      detail: "baru",
      reference_id: task1.id,
      message: `Anda telah ditugaskan ke: ${task1.title}`,
      is_read: false,
    },
  ]);

  // Step 2: Head B (different Head) edits assignees: removes Y, adds Z
  console.log("\nHead B editing assignees on Head A's task...");
  // 1. Remove Y
  const { error: delYErr } = await sbHeadB
    .from("task_assignees")
    .delete()
    .eq("task_id", task1.id)
    .eq("user_id", memberY.id);

  if (delYErr) {
    console.warn("Notice deleting Y:", delYErr.message);
  } else {
    console.log("✅ Head B successfully deleted Member Y from task_assignees");
  }

  // Insert notification for removed Y ('tugas', 'dihapus')
  const { error: notifYErr } = await sbHeadB.from("notifications").insert({
    user_id: memberY.id,
    category: "tugas",
    detail: "dihapus",
    reference_id: task1.id,
    message: `Anda telah dihapus dari penugasan: ${task1.title}`,
    is_read: false,
  });
  console.log(
    "Notification ('tugas', 'dihapus') for Y:",
    notifYErr ? "FAILED: " + notifYErr.message : "✅ Inserted successfully"
  );

  // 2. Add Z
  const { error: addZErr } = await sbHeadB
    .from("task_assignees")
    .insert({ task_id: task1.id, user_id: memberZ.id });

  if (addZErr) {
    console.warn("Notice adding Z:", addZErr.message);
  } else {
    console.log("✅ Head B successfully added Member Z to task_assignees");
  }

  // Insert notification for added Z ('tugas', 'baru')
  const { error: notifZErr } = await sbHeadB.from("notifications").insert({
    user_id: memberZ.id,
    category: "tugas",
    detail: "baru",
    reference_id: task1.id,
    message: `Anda telah ditugaskan ke: ${task1.title}`,
    is_read: false,
  });
  console.log(
    "Notification ('tugas', 'baru') for Z:",
    notifZErr ? "FAILED: " + notifZErr.message : "✅ Inserted successfully"
  );

  // Verify current assignees for task 1
  const { data: curAssignees } = await sbAdmin
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", task1.id);
  const curIds = curAssignees.map((a) => a.user_id);
  console.log("Current assignees in DB:", curIds);
  console.log("Includes Member X?", curIds.includes(memberX.id));
  console.log("Includes Member Z?", curIds.includes(memberZ.id));
  console.log("Does NOT include Member Y?", !curIds.includes(memberY.id));

  // --- TEST 4: Member X submits completion, then Head tries to delete Member X (must be blocked by RLS) ---
  console.log("\n--- TEST 4: DELETE block after submission test ---");
  const { data: compX, error: compXErr } = await sbMemberX
    .from("task_completions")
    .insert({
      task_id: task1.id,
      submitted_by: memberX.id,
      minutes_text: "Dokumentasi dari Member X",
      meeting_start_time: new Date().toISOString(),
      meeting_end_time: new Date().toISOString(),
      actual_location_address: "Lokasi Aktual X",
    })
    .select()
    .single();

  if (compXErr) throw compXErr;
  console.log("✅ Member X submitted completion:", compX.id);

  // Now Head B attempts to delete Member X from task_assignees (direct API / SQL RLS test)
  console.log("Head B attempting to remove Member X who has already submitted...");
  const { data: delResult, error: delXErr } = await sbHeadB
    .from("task_assignees")
    .delete()
    .eq("task_id", task1.id)
    .eq("user_id", memberX.id)
    .select();

  console.log("Delete attempt result:", { delResult, error: delXErr });
  if (delResult?.length === 0 || delXErr) {
    console.log("✅ RLS successfully prevented DELETE of already-submitted assignee!");
  } else {
    console.error("❌ RLS FAILED to block DELETE of already-submitted assignee!");
  }

  // --- TEST 5: Member cannot insert or delete task_assignees ---
  console.log("\n--- TEST 5: Member access control test ---");
  const { error: memInsErr } = await sbMemberX
    .from("task_assignees")
    .insert({ task_id: task1.id, user_id: memberY.id });
  console.log("Member INSERT into task_assignees blocked by RLS?", !!memInsErr, memInsErr?.message);

  // --- TEST 6: Auto-completion-on-removal test ---
  console.log("\n--- TEST 6: Auto-completion status flip on removal of pending assignee ---");
  // Create task with X and Y
  const { data: task2 } = await sbHeadA
    .from("tasks")
    .insert({
      title: "Auto-Completion Status Removal QA Test",
      scheduled_start: new Date().toISOString(),
      status: "pending",
      created_by: userHeadA.id,
    })
    .select()
    .single();

  await sbHeadA.from("task_assignees").insert([
    { task_id: task2.id, user_id: memberX.id },
    { task_id: task2.id, user_id: memberY.id },
  ]);

  // X submits completion
  await sbMemberX.from("task_completions").insert({
    task_id: task2.id,
    submitted_by: memberX.id,
    minutes_text: "Dokumentasi X untuk task 2",
    meeting_start_time: new Date().toISOString(),
    meeting_end_time: new Date().toISOString(),
  });

  // Verify task2 is still pending (because Y hasn't submitted)
  const { data: task2Before } = await sbAdmin.from("tasks").select("status").eq("id", task2.id).single();
  console.log("Task 2 status before Y removal (1 of 2 submitted):", task2Before.status, "(Expected: pending)");

  // Head removes Y (who has not submitted)
  await sbHeadB.from("task_assignees").delete().eq("task_id", task2.id).eq("user_id", memberY.id);

  // Check task 2 status immediately after removal of Y
  const { data: task2After } = await sbAdmin.from("tasks").select("status").eq("id", task2.id).single();
  console.log("Task 2 status after Y removal (1 of 1 submitted):", task2After.status, "(Expected: completed)");

  // Clean up QA test records
  console.log("\nCleaning up test records...");
  await sbAdmin.from("tasks").delete().eq("id", task1.id);
  await sbAdmin.from("tasks").delete().eq("id", task2.id);
  await sbAdmin.from("notifications").delete().eq("reference_id", task1.id);
  await sbAdmin.from("notifications").delete().eq("reference_id", task2.id);

  console.log("✅ All tests completed!");
}

runTests().catch(console.error);
