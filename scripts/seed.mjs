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
  console.log("Seeding 10 real accounts with admin API...");
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
      console.warn(`User ${email} creation message:`, error.message);
    } else {
      console.log(`Created user: ${acc.username} (${acc.role}) - ${acc.full_name}`);
      // Ensure profile exists
      if (data.user) {
        await supabaseAdmin.from("profiles").upsert({
          id: data.user.id,
          full_name: acc.full_name,
          role: acc.role,
          division: acc.division,
        });
      }
    }
  }

  // Ensure storage bucket exists
  const { data: bData, error: bErr } = await supabaseAdmin.storage.createBucket("completion-photos", {
    public: true,
    fileSizeLimit: 10485760,
  });
  if (bErr) {
    console.log("Storage bucket check:", bErr.message);
  } else {
    console.log("Storage bucket 'completion-photos' created successfully.");
  }
  console.log("Seeding complete!");
}

seed().catch(console.error);
