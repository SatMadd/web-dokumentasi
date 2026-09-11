import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.log(`
[SEED NOTICE]
SUPABASE_SERVICE_ROLE_KEY is not defined in .env.local.
You can either:
1. Copy the contents of 'supabase/seed.sql' and run it directly in your Supabase SQL Editor:
   https://supabase.com/dashboard/project/_/sql
   This will immediately create all 10 users with email_confirmed_at and password KOMINFO2026.
2. Add SUPABASE_SERVICE_ROLE_KEY=your_service_role_key to .env.local and run:
   npm run seed
`);
  process.exit(0);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ACCOUNTS = [
  // 5 Heads
  { username: "suprapto", full_name: "Suprapto Mulyono", role: "head", division: "Bagian Operasional & Perencanaan" },
  { username: "hendra", full_name: "Hendra Wijaya", role: "head", division: "Divisi TI & Infrastruktur" },
  { username: "dewi", full_name: "Dewi Lestari", role: "head", division: "Divisi Kehumasan & Informasi Publik" },
  { username: "bambang", full_name: "Bambang Suryono", role: "head", division: "Bagian Tata Usaha & Kepegawaian" },
  { username: "ratna", full_name: "Ratna Kusuma", role: "head", division: "Divisi Pengawasan & Akuntabilitas" },
  // 5 Members
  { username: "budi", full_name: "Budi Santoso", role: "member", division: "Divisi Dokumentasi & Acara" },
  { username: "siti", full_name: "Siti Rahma", role: "member", division: "Divisi Dokumentasi & Acara" },
  { username: "ahmad", full_name: "Ahmad Fauzi", role: "member", division: "Divisi Kehumasan & Informasi Publik" },
  { username: "anisa", full_name: "Anisa Permata", role: "member", division: "Divisi TI & Infrastruktur" },
  { username: "fajar", full_name: "Fajar Nugraha", role: "member", division: "Bagian Tata Usaha & Kepegawaian" },
];

async function seed() {
  console.log("=== DOOR Database Seeding ===");
  console.log("Checking Supabase connection & cleaning up broken accounts...");

  // 1. Fetch existing users to clean up broken raw-SQL accounts
  const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  if (listErr) {
    console.error("Failed to list existing users:", listErr.message);
  } else if (listData?.users) {
    const doorUsers = listData.users.filter((u) => u.email?.endsWith("@door.id"));
    console.log(`Found ${doorUsers.length} existing @door.id account(s). Deleting old records...`);
    for (const u of doorUsers) {
      // Delete any leftover profile first if needed
      await supabaseAdmin.from("profiles").delete().eq("id", u.id);
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(u.id);
      if (delErr) {
        console.warn(`  Warning deleting user ${u.email}:`, delErr.message);
      } else {
        console.log(`  Deleted old user: ${u.email} (${u.id})`);
      }
    }
  }

  console.log("\nRe-creating all 10 accounts with Admin API (email_confirm: true, password: KOMINFO2026)...");
  
  const createdAccounts = [];

  for (const acc of ACCOUNTS) {
    const email = `${acc.username}@door.id`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: "KOMINFO2026",
      email_confirm: true,
      user_metadata: {
        full_name: acc.full_name,
        role: acc.role,
        division: acc.division,
      },
    });

    if (error) {
      console.error(`❌ Failed to create user ${email}:`, error.message);
    } else if (data.user) {
      console.log(`✅ Created user: ${acc.username} (${acc.role}) - ${acc.full_name} [ID: ${data.user.id}]`);
      
      // Ensure profile row exists with accurate role and division
      const { error: profErr } = await supabaseAdmin.from("profiles").upsert({
        id: data.user.id,
        full_name: acc.full_name,
        role: acc.role,
        division: acc.division,
      });

      if (profErr) {
        console.warn(`  ⚠️ Profile upsert warning for ${acc.username}:`, profErr.message);
      } else {
        console.log(`  └─ Profile verified: role=${acc.role}, division=${acc.division}`);
      }

      createdAccounts.push({
        id: data.user.id,
        username: acc.username,
        email,
        role: acc.role,
        confirmed: !!data.user.email_confirmed_at,
      });
    }
  }

  // Ensure storage bucket exists and is private per schema.md section 6
  console.log("\nVerifying 'completion-photos' storage bucket...");
  const { data: bData, error: bErr } = await supabaseAdmin.storage.createBucket("completion-photos", {
    public: false,
    fileSizeLimit: 10485760,
  });
  if (bErr) {
    console.log("Storage bucket notice:", bErr.message);
    await supabaseAdmin.storage.updateBucket("completion-photos", {
      public: false,
      fileSizeLimit: 10485760,
    });
  } else {
    console.log("Storage bucket 'completion-photos' verified/created successfully as private.");
  }

  console.log("\n=== Seeding Summary ===");
  console.log(`Successfully created and confirmed ${createdAccounts.length} / ${ACCOUNTS.length} accounts:`);
  console.table(createdAccounts);
}

seed().catch(console.error);
