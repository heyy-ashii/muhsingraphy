/* ============================================================
   Muhsingraphy — public client configuration
   ------------------------------------------------------------
   Fill these in to connect the storefront to Supabase.

   ONLY the publishable key belongs here. It is designed to be
   public and ships to every visitor's browser. It is safe ONLY
   because every table has Row Level Security enabled (see
   supabase/schema.sql) — the key grants nothing beyond the
   policies defined there.

   NEVER put the secret key (sb_secret_...) in this file, in any
   other client file, or in this repository. It bypasses RLS and
   would hand full read/write/delete access to anyone who opens
   the site. Privileged work belongs in a server-side Edge
   Function, not here.

   Leave both values empty to run the site on its built-in
   static content with no network calls.
   ============================================================ */

/* Project: klqnhwnvivqnpuxxfyap. The publishable key below is public
   by design. The matching SECRET key was exposed in a chat transcript
   and must be rotated in the Supabase dashboard; it must never be
   pasted into this file. */

window.MUHSI_CONFIG = {
  supabaseUrl: "https://klqnhwnvivqnpuxxfyap.supabase.co",
  supabasePublishableKey: "sb_publishable_F-o-wxS3SD5C-qg_n688vA__dzaH5fB",
};
