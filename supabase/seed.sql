-- RobloxOps demo data — Apex UGC Studio.
-- Run with `supabase db reset` (migrations 0001-0003 first).
-- Demo logins (auth.users rows are required by users.id -> auth.users.id):
--   elena@apexugc.studio / marcus@apexugc.studio / devon@apexugc.studio
--   password: robloxops123
-- All rows use fixed UUIDs so the seed is re-runnable (on conflict do nothing).

set search_path = public, extensions;
set client_min_messages = warning;

begin;

-- ---------------------------------------------------------------------------
-- Auth users (FK target for public.users)
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'elena@apexugc.studio',
    crypt('robloxops123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Elena R."}',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'marcus@apexugc.studio',
    crypt('robloxops123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Marcus T."}',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'devon@apexugc.studio',
    crypt('robloxops123', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Devon K."}',
    '', '', '', ''
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tenant
-- ---------------------------------------------------------------------------

insert into public.tenants (
  id, name, slug, discord_guild_id, plan_id, settings, ai_credits_used, created_at, updated_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  'Apex UGC Studio',
  'apex-ugc',
  '1182736450918273645',
  'growth',
  $json${
    "ai_paused": false,
    "tone": "friendly-professional",
    "timezone": "UTC",
    "business_hours": {"start": "09:00", "end": "18:00", "days": ["mon", "tue", "wed", "thu", "fri"]},
    "notification_channel_id": "1182736450918273999",
    "max_followups_per_project": 3
  }$json$::jsonb,
  4200,
  '2026-09-01T08:00:00Z',
  '2026-10-19T08:00:00Z'
)
on conflict (id) do nothing;

-- Next allocation for this tenant is ROB-105.
insert into public.tenant_counters (tenant_id, last_seq, updated_at)
values ('11111111-1111-4111-8111-111111111111', 104, '2026-10-19T07:58:00Z')
on conflict (tenant_id) do nothing;

-- ---------------------------------------------------------------------------
-- Studio team
-- ---------------------------------------------------------------------------

insert into public.users (id, tenant_id, email, display_name, role, discord_user_id, created_at)
values
  ('b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'elena@apexugc.studio', 'Elena R.', 'owner', '410293847561029384', '2026-09-01T08:05:00Z'),
  ('b0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'marcus@apexugc.studio', 'Marcus T.', 'manager', '410293847561029385', '2026-09-01T08:06:00Z'),
  ('b0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'devon@apexugc.studio', 'Devon K.', 'designer', '410293847561029386', '2026-09-03T10:00:00Z')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Customers (the 8 clients referenced by the mock project list)
-- ---------------------------------------------------------------------------

insert into public.customers (
  id, tenant_id, discord_user_id, discord_username, display_name,
  total_projects, total_spent_robux, notes, created_at
)
values
  ('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   '893104810293', 'kevroblox', '@KevRoblox', 4, 272000, 'Repeat buyer. Prefers back-mounted accessories.', '2026-06-12T14:00:00Z'),
  ('c0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   '774209113402', 'novavalk', '@NovaValk', 2, 102000, 'Neon / valkyrie aesthetic.', '2026-07-02T09:30:00Z'),
  ('c0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   '662910447731', 'studiohyper', '@StudioHyper', 11, 1408000, 'Studio partner; monthly asset packs.', '2026-03-18T11:00:00Z'),
  ('c0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   '551882093311', 'bloxdevx', '@BloxDevX', 3, 270000, 'Y2K streetwear commissions.', '2026-05-27T16:20:00Z'),
  ('c0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
   '440291885520', 'aerogames', '@AeroGames', 6, 882000, 'Flight sim dev group; rigging heavy.', '2026-04-09T10:15:00Z'),
  ('c0000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111',
   '339104772281', 'pixelforge', '@PixelForge', 0, 0, 'First-time client, intake via Discord.', '2026-10-19T07:58:00Z'),
  ('c0000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111',
   '228113990044', 'chloeugc', '@ChloeUGC', 5, 300000, 'Fast approvals, detail-oriented on materials.', '2026-04-30T12:00:00Z'),
  ('c0000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111',
   '117290334455', 'nikabuilds', '@NikaBuilds', 1, 108000, 'Cottagecore / modular furniture.', '2026-10-13T18:00:00Z')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Projects (ROB-096 .. ROB-104, mirroring apps/web/src/lib/mock.ts)
-- ---------------------------------------------------------------------------

insert into public.projects (
  id, tenant_id, customer_id, reference_code, title, status, project_type,
  deadline, price_robux, price_usd, payment_status, revision_count, max_revisions,
  assigned_designer_id, discord_thread_id, created_at, updated_at
)
values
  ('a0000000-0000-4000-8000-000000000104', '11111111-1111-4111-8111-111111111111',
   'c0000000-0000-4000-8000-000000000001', 'ROB-104', 'Cyber Samurai Katana & Scabbard',
   'qa_check', 'accessory', '2026-10-19T15:00:00Z', 68000, 240.00, 'paid', 0, 2,
   'b0000000-0000-4000-8000-000000000001', '1182736450918273104',
   '2026-10-14T09:12:00Z', '2026-10-19T08:12:00Z'),

  ('a0000000-0000-4000-8000-000000000103', '11111111-1111-4111-8111-111111111111',
   'c0000000-0000-4000-8000-000000000002', 'ROB-103', 'Valkyrie Neon Wings Set',
   'in_design', 'clothing', '2026-10-20T12:00:00Z', 51000, 180.00, 'partial', 0, 2,
   'b0000000-0000-4000-8000-000000000002', '1182736450918273103',
   '2026-10-15T10:00:00Z', '2026-10-18T19:40:00Z'),

  ('a0000000-0000-4000-8000-000000000102', '11111111-1111-4111-8111-111111111111',
   'c0000000-0000-4000-8000-000000000003', 'ROB-102', 'Anime Combat FX Pack',
   'customer_review', 'game_asset', '2026-10-21T09:00:00Z', 128000, 450.00, 'paid', 0, 2,
   'b0000000-0000-4000-8000-000000000003', '1182736450918273102',
   '2026-10-12T14:00:00Z', '2026-10-18T14:22:00Z'),

  ('a0000000-0000-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111',
   'c0000000-0000-4000-8000-000000000004', 'ROB-101', 'Y2K Streetwear Hoodie & Beanie',
   'delivered', 'clothing', '2026-10-29T17:00:00Z', 90000, 320.00, 'paid', 1, 2,
   'b0000000-0000-4000-8000-000000000001', '1182736450918273101',
   '2026-10-08T09:00:00Z', '2026-10-17T11:05:00Z'),

  ('a0000000-0000-4000-8000-000000000100', '11111111-1111-4111-8111-111111111111',
   'c0000000-0000-4000-8000-000000000005', 'ROB-100', 'R15 Skeleton Rig & Weightmaps',
   'briefing', 'avatar_item', '2026-10-30T10:00:00Z', 147000, 520.00, 'pending', 0, 2,
   'b0000000-0000-4000-8000-000000000002', '1182736450918273100',
   '2026-10-16T11:20:00Z', '2026-10-18T09:31:00Z'),

  ('a0000000-0000-4000-8000-000000000098', '11111111-1111-4111-8111-111111111111',
   'c0000000-0000-4000-8000-000000000006', 'ROB-098', 'Arcane Enote Staff Prop',
   'intake', 'accessory', null, 42000, 150.00, 'pending', 0, 2,
   null, null,
   '2026-10-19T07:58:00Z', '2026-10-19T07:58:00Z'),

  ('a0000000-0000-4000-8000-000000000097', '11111111-1111-4111-8111-111111111111',
   'c0000000-0000-4000-8000-000000000007', 'ROB-097', 'Neon Racer Helmet',
   'revision', 'accessory', '2026-10-22T16:00:00Z', 60000, 210.00, 'partial', 1, 2,
   'b0000000-0000-4000-8000-000000000003', '1182736450918273097',
   '2026-10-10T12:00:00Z', '2026-10-19T06:40:00Z'),

  ('a0000000-0000-4000-8000-000000000096', '11111111-1111-4111-8111-111111111111',
   'c0000000-0000-4000-8000-000000000008', 'ROB-096', 'Cottagecore Furniture Bundle',
   'in_design', 'game_asset', '2026-10-24T12:00:00Z', 108000, 380.00, 'pending', 0, 2,
   'b0000000-0000-4000-8000-000000000001', '1182736450918273096',
   '2026-10-13T18:00:00Z', '2026-10-18T21:15:00Z')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Briefs (structured_data matches the UI Brief shape)
-- ---------------------------------------------------------------------------

insert into public.briefs (
  id, project_id, tenant_id, raw_conversation_summary, structured_data,
  completeness_score, approved_by_designer, approved_at, created_at, updated_at
)
values
  (
    'd1000000-0000-4000-8000-000000000104',
    'a0000000-0000-4000-8000-000000000104', '11111111-1111-4111-8111-111111111111',
    'Customer asked for a cyber samurai katana with a neon cyan blade and a scabbard; confirmed back-right attachment and a 240 USD budget.',
    $json${
      "summary": "Neon cyberpunk katana paired with an angular magnetic scabbard. High-contrast emissive cyan blade edge (#00A2FF) balanced by matte obsidian tsuka wrap and weathered industrial carbon chassis.",
      "specs": [
        {"label": "Polygon Limit", "value": "< 4,000 Tris", "note": "Roblox Avatar UGC Cap"},
        {"label": "Texture Map", "value": "256x256 px", "note": "Diffuse + Surface Normal"},
        {"label": "Attachment Rig", "value": "Waist/Back Right", "note": "R15 Socket Compatible"},
        {"label": "Engine Constraints", "value": "In-Box Bounds", "note": "Mesh limits validated"}
      ],
      "palette": [
        {"label": "Blade Glow", "hex": "#00A2FF"},
        {"label": "Tsuka Grip", "hex": "#070D1F"},
        {"label": "Chassis", "hex": "#89919D"}
      ],
      "references": [
        {"id": "r1", "label": "blade_silhouette_ref"},
        {"id": "r2", "label": "tsuka_wireframe_pass"},
        {"id": "r3", "label": "roblox_avatar_rig"}
      ],
      "directives": "Must have idle trail particle compatibility and custom weld for R15 avatars. Weld constraint validated against UpperTorso and LowerTorso default bones."
    }$json$::jsonb,
    96, true, '2026-10-14T10:05:00Z', '2026-10-14T09:15:00Z', '2026-10-14T10:05:00Z'
  ),
  (
    'd1000000-0000-4000-8000-000000000103',
    'a0000000-0000-4000-8000-000000000103', '11111111-1111-4111-8111-111111111111',
    'Customer wants layered neon valkyrie wings over a tactical trenchcoat; partial payment received.',
    $json${
      "summary": "Layered neon valkyrie wing set built over a tactical trenchcoat silhouette, with emissive feather tips and a restrained military palette.",
      "specs": [
        {"label": "Polygon Limit", "value": "< 8,000 Tris", "note": "Layered clothing budget"},
        {"label": "Texture Map", "value": "1024x1024 px", "note": "Diffuse + Normal + Emission"},
        {"label": "Rigging", "value": "R15 Layered Clothing", "note": "Cage validated"}
      ],
      "palette": [
        {"label": "Wing Glow", "hex": "#7DF9FF"},
        {"label": "Trenchcoat", "hex": "#2B2F3A"}
      ],
      "references": [{"id": "r1", "label": "valkyrie_wings_moodboard"}],
      "directives": "Keep the wing silhouette readable at distance; emission must not exceed Roblox brightness guidelines."
    }$json$::jsonb,
    88, true, '2026-10-15T11:10:00Z', '2026-10-15T10:20:00Z', '2026-10-15T11:10:00Z'
  ),
  (
    'd1000000-0000-4000-8000-000000000102',
    'a0000000-0000-4000-8000-000000000102', '11111111-1111-4111-8111-111111111111',
    'StudioHyper ordered a 12-piece anime combat FX pack for an upcoming game update.',
    $json${
      "summary": "Anime combat FX pack: 12 stylized impact, slash, and aura effects delivered as Roblox-ready models with emissive textures.",
      "specs": [
        {"label": "Asset Count", "value": "12 effects", "note": "Slash, impact, aura"},
        {"label": "Texture Map", "value": "512x512 px", "note": "Emissive atlas"},
        {"label": "Engine Constraints", "value": "Particle-ready", "note": "No scripts required"}
      ],
      "palette": [
        {"label": "Impact", "hex": "#FF4D6D"},
        {"label": "Aura", "hex": "#4D7CFF"}
      ],
      "references": [{"id": "r1", "label": "anime_fx_style_ref"}],
      "directives": "Effects must be usable inside ParticleEmitters without custom code."
    }$json$::jsonb,
    94, true, '2026-10-12T15:30:00Z', '2026-10-12T14:20:00Z', '2026-10-12T15:30:00Z'
  ),
  (
    'd1000000-0000-4000-8000-000000000101',
    'a0000000-0000-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111',
    'Y2K streetwear set: oversized hoodie plus a cyberpunk beanie with messy curls.',
    $json${
      "summary": "Y2K streetwear hoodie and beanie combo with oversized proportions and a cyberpunk beanie hair attachment.",
      "specs": [
        {"label": "Polygon Limit", "value": "< 6,000 Tris", "note": "Clothing + hat"},
        {"label": "Texture Map", "value": "1024x1024 px", "note": "Diffuse + Normal"},
        {"label": "Attachment Rig", "value": "Hat / Hair Combo", "note": "R15 compatible"}
      ],
      "palette": [
        {"label": "Hoodie", "hex": "#B8B8C4"},
        {"label": "Beanie", "hex": "#1B1B22"}
      ],
      "references": [{"id": "r1", "label": "y2k_streetwear_moodboard"}],
      "directives": "Hair must not clip through the beanie in the default idle pose."
    }$json$::jsonb,
    92, true, '2026-10-08T10:00:00Z', '2026-10-08T09:20:00Z', '2026-10-08T10:00:00Z'
  ),
  (
    'd1000000-0000-4000-8000-000000000100',
    'a0000000-0000-4000-8000-000000000100', '11111111-1111-4111-8111-111111111111',
    'AeroGames needs a custom R15 skeleton and weightmaps for a flight-sim character. Brief still being collected.',
    $json${
      "summary": "Custom R15 skeleton with clean weightmaps for a flight-sim character, including shoulder and knee deformation tests.",
      "specs": [
        {"label": "Rig", "value": "R15 Custom Skeleton", "note": "Pending final bone list"},
        {"label": "Weightmaps", "value": "Full body", "note": "Deformation tested"}
      ],
      "palette": [],
      "references": [{"id": "r1", "label": "r15_rig_reference"}],
      "directives": "Awaiting confirmation of extra spine bones before production."
    }$json$::jsonb,
    64, false, null, '2026-10-16T11:40:00Z', '2026-10-18T09:31:00Z'
  ),
  (
    'd1000000-0000-4000-8000-000000000098',
    'a0000000-0000-4000-8000-000000000098', '11111111-1111-4111-8111-111111111111',
    'First message only: customer wants an Arcane Enote staff prop with a VFX attachment. No budget or deadline confirmed yet.',
    $json${
      "summary": "Arcane Enote staff prop with a magic VFX attachment.",
      "specs": [],
      "palette": [],
      "references": [],
      "directives": ""
    }$json$::jsonb,
    18, false, null, '2026-10-19T07:58:00Z', '2026-10-19T07:58:00Z'
  ),
  (
    'd1000000-0000-4000-8000-000000000097',
    'a0000000-0000-4000-8000-000000000097', '11111111-1111-4111-8111-111111111111',
    'Neon racer helmet; customer rejected the first visor pass for being too glossy and asked for matte chrome.',
    $json${
      "summary": "Neon racer helmet with a chrome visor and low-poly silhouette, revised to a matte chrome finish.",
      "specs": [
        {"label": "Polygon Limit", "value": "< 3,000 Tris", "note": "Accessory budget"},
        {"label": "Texture Map", "value": "512x512 px", "note": "Metallic + Roughness"},
        {"label": "Attachment Rig", "value": "Head", "note": "R15 compatible"}
      ],
      "palette": [
        {"label": "Visor", "hex": "#C9CED6"},
        {"label": "Shell", "hex": "#101418"}
      ],
      "references": [{"id": "r1", "label": "racer_helmet_ref"}],
      "directives": "Visor roughness must be >= 0.6; no mirror finish."
    }$json$::jsonb,
    90, true, '2026-10-10T12:30:00Z', '2026-10-10T12:10:00Z', '2026-10-19T06:40:00Z'
  ),
  (
    'd1000000-0000-4000-8000-000000000096',
    'a0000000-0000-4000-8000-000000000096', '11111111-1111-4111-8111-111111111111',
    'NikaBuilds commissioned 14 modular cottagecore furniture props sharing one 512px texture atlas.',
    $json${
      "summary": "Cottagecore furniture bundle: 14 modular props sharing a single 512px texture atlas.",
      "specs": [
        {"label": "Asset Count", "value": "14 props", "note": "Modular kit"},
        {"label": "Texture Map", "value": "512x512 atlas", "note": "Single material"},
        {"label": "Engine Constraints", "value": "In-Box Bounds", "note": "Grid-snapped"}
      ],
      "palette": [
        {"label": "Wood", "hex": "#A9744F"},
        {"label": "Fabric", "hex": "#E8D8C3"}
      ],
      "references": [{"id": "r1", "label": "cottagecore_kit_ref"}],
      "directives": "Props must snap to a 4-stud grid and share one material."
    }$json$::jsonb,
    85, true, '2026-10-13T19:00:00Z', '2026-10-13T18:20:00Z', '2026-10-13T19:00:00Z'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Deliverables
-- ---------------------------------------------------------------------------

insert into public.deliverables (
  id, project_id, tenant_id, version, file_path, file_type, file_size_bytes,
  uploaded_by, is_final, qa_status, qa_report, sent_to_customer_at, created_at
)
values
  (
    'e1000000-0000-4000-8000-000000001041',
    'a0000000-0000-4000-8000-000000000104', '11111111-1111-4111-8111-111111111111',
    2, 'tenants/11111111-1111-4111-8111-111111111111/deliverables/ROB-104/katana_cyber_v1.2.rbxm',
    'rbxm', 1887437, 'b0000000-0000-4000-8000-000000000001', true, 'passed',
    $json${
      "score": 98,
      "max_score": 100,
      "checks": [
        {"label": "Triangle count", "value": "3,420 / 4,000", "passed": true},
        {"label": "Texture resolution", "value": "256x256 PNG", "passed": true},
        {"label": "Cage mesh bounds", "value": "In-box limits", "passed": true},
        {"label": "Rigging attachment", "value": "WaistBack", "passed": true}
      ],
      "model": "gpt-4o",
      "checked_at": "2026-10-19T08:10:00Z"
    }$json$::jsonb,
    null, '2026-10-19T07:45:00Z'
  ),
  (
    'e1000000-0000-4000-8000-000000001042',
    'a0000000-0000-4000-8000-000000000104', '11111111-1111-4111-8111-111111111111',
    2, 'tenants/11111111-1111-4111-8111-111111111111/deliverables/ROB-104/katana_render_preview.png',
    'png', 2457600, 'b0000000-0000-4000-8000-000000000001', false, 'skipped', null, null, '2026-10-19T07:46:00Z'
  ),
  (
    'e1000000-0000-4000-8000-000000001043',
    'a0000000-0000-4000-8000-000000000104', '11111111-1111-4111-8111-111111111111',
    2, 'tenants/11111111-1111-4111-8111-111111111111/deliverables/ROB-104/katana_texture_diffuse.png',
    'png', 65536, 'b0000000-0000-4000-8000-000000000001', false, 'skipped', null, null, '2026-10-19T07:46:00Z'
  ),
  (
    'e1000000-0000-4000-8000-000000001031',
    'a0000000-0000-4000-8000-000000000103', '11111111-1111-4111-8111-111111111111',
    2, 'tenants/11111111-1111-4111-8111-111111111111/deliverables/ROB-103/valkyrie_wings_v2.rbxm',
    'rbxm', 4404019, 'b0000000-0000-4000-8000-000000000002', false, 'pending', null, null, '2026-10-18T19:40:00Z'
  ),
  (
    'e1000000-0000-4000-8000-000000001021',
    'a0000000-0000-4000-8000-000000000102', '11111111-1111-4111-8111-111111111111',
    3, 'tenants/11111111-1111-4111-8111-111111111111/deliverables/ROB-102/anime_fx_pack_v3.rbxm',
    'rbxm', 7340032, 'b0000000-0000-4000-8000-000000000003', true, 'passed',
    $json${
      "score": 100,
      "max_score": 100,
      "checks": [
        {"label": "Asset count", "value": "12 / 12", "passed": true},
        {"label": "Texture atlas", "value": "512x512", "passed": true},
        {"label": "Particle compatibility", "value": "Verified", "passed": true}
      ],
      "model": "gpt-4o",
      "checked_at": "2026-10-18T14:10:00Z"
    }$json$::jsonb,
    '2026-10-18T14:30:00Z', '2026-10-18T13:55:00Z'
  ),
  (
    'e1000000-0000-4000-8000-000000001011',
    'a0000000-0000-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111',
    2, 'tenants/11111111-1111-4111-8111-111111111111/deliverables/ROB-101/y2k_hoodie_beanie_final.rbxm',
    'rbxm', 2936012, 'b0000000-0000-4000-8000-000000000001', true, 'passed',
    $json${
      "score": 94,
      "max_score": 100,
      "checks": [
        {"label": "Triangle count", "value": "5,120 / 6,000", "passed": true},
        {"label": "Hat clipping", "value": "No clip at idle", "passed": true},
        {"label": "Texture resolution", "value": "1024x1024", "passed": true}
      ],
      "model": "gpt-4o",
      "checked_at": "2026-10-17T10:50:00Z"
    }$json$::jsonb,
    '2026-10-17T11:10:00Z', '2026-10-17T10:30:00Z'
  ),
  (
    'e1000000-0000-4000-8000-000000000971',
    'a0000000-0000-4000-8000-000000000097', '11111111-1111-4111-8111-111111111111',
    2, 'tenants/11111111-1111-4111-8111-111111111111/deliverables/ROB-097/neon_racer_helmet_v2.rbxm',
    'rbxm', 1572864, 'b0000000-0000-4000-8000-000000000003', false, 'failed',
    $json${
      "score": 71,
      "max_score": 100,
      "checks": [
        {"label": "Triangle count", "value": "2,640 / 3,000", "passed": true},
        {"label": "Visor roughness", "value": "0.35 (brief requires >= 0.6)", "passed": false},
        {"label": "Attachment rig", "value": "Head", "passed": true}
      ],
      "model": "gpt-4o",
      "checked_at": "2026-10-19T06:35:00Z"
    }$json$::jsonb,
    '2026-10-19T06:45:00Z', '2026-10-19T06:20:00Z'
  ),
  (
    'e1000000-0000-4000-8000-000000000961',
    'a0000000-0000-4000-8000-000000000096', '11111111-1111-4111-8111-111111111111',
    1, 'tenants/11111111-1111-4111-8111-111111111111/deliverables/ROB-096/cottagecore_atlas_v1.rbxm',
    'rbxm', 2097152, 'b0000000-0000-4000-8000-000000000001', false, 'pending', null, null, '2026-10-18T21:15:00Z'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tasks (designer queue)
-- ---------------------------------------------------------------------------

insert into public.tasks (
  id, tenant_id, project_id, assigned_to, title, description,
  status, due_at, priority, created_at, updated_at
)
values
  ('f1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000104', 'b0000000-0000-4000-8000-000000000001',
   'Finalise katana scabbard weld + QA pass', 'Weld the scabbard to the back-right socket and confirm the QA report.',
   'in_progress', '2026-10-19T15:00:00Z', 2, '2026-10-14T09:20:00Z', '2026-10-19T08:00:00Z'),

  ('f1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000103', 'b0000000-0000-4000-8000-000000000002',
   'Layered clothing cage sim retopo', 'Retopologise the wing cage so it deforms cleanly on R15.',
   'pending', '2026-10-20T12:00:00Z', 2, '2026-10-15T10:30:00Z', '2026-10-18T19:40:00Z'),

  ('f1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000097', 'b0000000-0000-4000-8000-000000000003',
   'Revision 2 — chrome visor roughness', 'Raise visor roughness to at least 0.6 and re-export.',
   'pending', '2026-10-22T16:00:00Z', 1, '2026-10-19T06:40:00Z', '2026-10-19T06:40:00Z'),

  ('f1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000096', 'b0000000-0000-4000-8000-000000000001',
   'Modular furniture texture atlas', 'Pack all 14 props into the shared 512px atlas.',
   'in_progress', '2026-10-24T12:00:00Z', 1, '2026-10-13T18:30:00Z', '2026-10-18T21:15:00Z'),

  ('f1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000100', 'b0000000-0000-4000-8000-000000000002',
   'Await brief approval before rigging', 'Blocked until AeroGames confirms the extra spine bones.',
   'blocked', '2026-10-30T10:00:00Z', 0, '2026-10-16T11:40:00Z', '2026-10-18T09:31:00Z'),

  ('f1000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000001',
   'Export final Y2K hoodie + beanie', 'Final export delivered and acknowledged by the customer.',
   'done', '2026-10-17T11:00:00Z', 1, '2026-10-08T10:10:00Z', '2026-10-17T11:05:00Z')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Conversations (Discord log)
-- ---------------------------------------------------------------------------

insert into public.conversations (
  id, tenant_id, project_id, customer_id, discord_channel_id, discord_message_id,
  direction, content, author_discord_id, sent_by_agent, agent_id, created_at
)
values
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000104', 'c0000000-0000-4000-8000-000000000001',
   '1182736450918273104', '1182736450918273201', 'inbound',
   'hey, i want a cyber samurai katana for my avatar, neon cyan blade, dark grip',
   '893104810293', false, null, '2026-10-14T09:12:00Z'),

  ('c1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000104', 'c0000000-0000-4000-8000-000000000001',
   '1182736450918273104', '1182736450918273202', 'outbound',
   'Got it — cyber samurai katana with a neon cyan edge. Two quick things: should it attach at the waist or back, and do you need a scabbard included?',
   null, true, 'communication', '2026-10-14T09:12:40Z'),

  ('c1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000104', 'c0000000-0000-4000-8000-000000000001',
   '1182736450918273104', '1182736450918273203', 'inbound',
   'back right, and yes scabbard. budget around 240 usd',
   '893104810293', false, null, '2026-10-14T09:14:00Z'),

  ('c1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000104', 'c0000000-0000-4000-8000-000000000001',
   '1182736450918273104', '1182736450918273204', 'outbound',
   'Locked in. Brief ROB-104 is registered: rigged accessory, waist/back right socket, 256x256 texture, under 4,000 tris. Elena starts today.',
   null, true, 'communication', '2026-10-14T09:15:00Z'),

  ('c1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000103', 'c0000000-0000-4000-8000-000000000002',
   '1182736450918273103', '1182736450918273301', 'inbound',
   'Can you do layered clothing with a neon valkyrie theme? Budget is 180 USD.',
   '774209113402', false, null, '2026-10-15T10:02:00Z'),

  ('c1000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000103', 'c0000000-0000-4000-8000-000000000002',
   '1182736450918273103', '1182736450918273302', 'outbound',
   'Yes — I have you down for ROB-103: layered wing set over a tactical trenchcoat. Marcus is on retopo now.',
   null, true, 'communication', '2026-10-15T10:05:00Z'),

  ('c1000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000098', 'c0000000-0000-4000-8000-000000000006',
   '1182736450918273098', '1182736450918273401', 'inbound',
   'I want an Arcane Enote staff prop, magic staff with a VFX attachment.',
   '339104772281', false, null, '2026-10-19T07:58:00Z'),

  ('c1000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000098', 'c0000000-0000-4000-8000-000000000006',
   '1182736450918273098', '1182736450918273402', 'outbound',
   'Nice — a few quick questions: is this for an R15 avatar or a game prop, and do you have a budget range in Robux or USD?',
   null, true, 'communication', '2026-10-19T07:58:30Z'),

  ('c1000000-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000097', 'c0000000-0000-4000-8000-000000000007',
   '1182736450918273097', '1182736450918273501', 'inbound',
   'The visor is way too glossy, can you make it matte chrome?',
   '228113990044', false, null, '2026-10-19T06:38:00Z'),

  ('c1000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000097', 'c0000000-0000-4000-8000-000000000007',
   '1182736450918273097', '1182736450918273502', 'outbound',
   'Understood — revision 2 queued for Devon: matte chrome visor, roughness at least 0.6. No extra charge.',
   null, true, 'communication', '2026-10-19T06:40:00Z')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Agent audit log (append-only sample)
-- ---------------------------------------------------------------------------

insert into public.agent_audit_log (
  id, tenant_id, agent_name, action, entity_type, entity_id,
  input_summary, output_summary, model_used, tokens_in, tokens_out,
  cost_usd, duration_ms, status, error_message, created_at
)
values
  ('a1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'communication', 'intent_classified', 'project', 'a0000000-0000-4000-8000-000000000104',
   'hey, i want a cyber samurai katana for my avatar...',
   'commission_request (confidence 0.96)',
   'gemini-2.5-flash', 312, 18, 0.000091, 640, 'success', null, '2026-10-14T09:12:30Z'),

  ('a1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'brief_collector', 'brief_extracted', 'project', 'a0000000-0000-4000-8000-000000000104',
   'back right, and yes scabbard. budget around 240 usd',
   'structured brief: accessory, back-right socket, 256x256, <4000 tris',
   'gpt-4o-mini', 1240, 410, 0.000612, 2100, 'success', null, '2026-10-14T09:15:00Z'),

  ('a1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'project_manager', 'project_created', 'project', 'a0000000-0000-4000-8000-000000000104',
   'brief a0000000-0000-4000-8000-000000000104 approved',
   'ROB-104 created, assigned to Elena, task queued',
   null, null, null, 0, 85, 'success', null, '2026-10-14T09:15:05Z'),

  ('a1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'qa_agent', 'qa_check_completed', 'deliverable', 'e1000000-0000-4000-8000-000000001041',
   'katana_cyber_v1.2.rbxm vs brief ROB-104',
   'passed: 4/4 checks, score 98/100',
   'gpt-4o', 980, 220, 0.0051, 4300, 'success', null, '2026-10-19T08:10:00Z'),

  ('a1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
   'communication', 'message_sent', 'project', 'a0000000-0000-4000-8000-000000000103',
   'customer asked about layered valkyrie clothing',
   'status reply drafted and sent in #order-103',
   'claude-haiku', 540, 160, 0.000095, 900, 'success', null, '2026-10-18T19:40:00Z'),

  ('a1000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111',
   'follow_up_agent', 'revision_escalated', 'project', 'a0000000-0000-4000-8000-000000000097',
   'customer requested a second visor change on ROB-097',
   'escalated to human: revision 1 of 2 consumed, next pass needs approval',
   null, null, null, 0, 120, 'escalated',
   'Revision limit threshold reached; owner approval required before a third pass.',
   '2026-10-19T06:42:00Z')
on conflict (id) do nothing;

commit;
