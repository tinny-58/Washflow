import { pool } from "../src/db";

async function migrate() {
  console.log("🚀 Starting Phase 1 Schema Migration for Referrals & Loyalty V2...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. referral_codes table
    console.log("1. Creating referral_codes table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code text NOT NULL UNIQUE,
        active boolean NOT NULL DEFAULT true,
        rotated_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS referral_codes_user_idx ON referral_codes(user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_code_idx ON referral_codes(code);
    `);

    // 2. referral_visits table
    console.log("2. Creating referral_visits table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_visits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL,
        visitor_hash text NOT NULL,
        device_class text,
        landing_path text NOT NULL DEFAULT '/r/',
        converted boolean NOT NULL DEFAULT false,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS referral_visits_code_idx ON referral_visits(code, created_at);
      CREATE INDEX IF NOT EXISTS referral_visits_visitor_idx ON referral_visits(visitor_hash, created_at);
    `);

    // 3. Update referrals table to match Phase 1 spec
    console.log("3. Updating referrals table...");
    await client.query(`
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS attribution_source text NOT NULL DEFAULT 'link';
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS flag_reason text;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS qualifying_order_id uuid REFERENCES bookings(id) ON DELETE SET NULL;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS signed_up_at timestamp with time zone NOT NULL DEFAULT now();
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS booked_at timestamp with time zone;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;
      ALTER TABLE referrals ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();
    `);

    // Ensure UNIQUE(referred_user_id) constraint exists on referrals
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS referrals_unique_referee_idx ON referrals (referred_user_id);
    `);

    // 4. points_ledger table (Source of truth, append-only, separate referral | loyalty)
    console.log("4. Creating points_ledger table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS points_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        track text NOT NULL CHECK (track IN ('referral', 'loyalty')),
        delta integer NOT NULL,
        reason text NOT NULL,
        order_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
        referral_id uuid REFERENCES referrals(id) ON DELETE SET NULL,
        source_event_id text NOT NULL,
        balance_after integer NOT NULL,
        metadata jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_track_source_event_idx ON points_ledger (track, source_event_id);
      CREATE INDEX IF NOT EXISTS points_ledger_client_track_idx ON points_ledger (client_id, track, created_at);
    `);

    // 5. reward_entitlements table
    console.log("5. Creating reward_entitlements table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS reward_entitlements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        milestone_key text NOT NULL,
        milestone_index integer NOT NULL,
        points_snapshot integer NOT NULL DEFAULT 500,
        status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('earned', 'pending_approval', 'approved', 'rejected', 'voided', 'expired')),
        voucher_id uuid,
        approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
        approved_at timestamp with time zone,
        rejected_reason text,
        void_reason text,
        flag_signals jsonb,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS reward_entitlements_client_milestone_idx ON reward_entitlements (client_id, milestone_key, milestone_index);
      CREATE INDEX IF NOT EXISTS reward_entitlements_status_idx ON reward_entitlements (status, created_at);
      CREATE INDEX IF NOT EXISTS reward_entitlements_client_idx ON reward_entitlements (client_id);
    `);

    // 6. Update vouchers table
    console.log("6. Updating vouchers table...");
    await client.query(`
      ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS entitlement_id uuid REFERENCES reward_entitlements(id) ON DELETE SET NULL;
      ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS eligible_item_ids jsonb NOT NULL DEFAULT '[]';
      ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS reserved_order_id uuid REFERENCES bookings(id) ON DELETE SET NULL;
    `);

    // Add foreign key from reward_entitlements.voucher_id to vouchers(id) if not present
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'reward_entitlements_voucher_id_fkey'
        ) THEN
          ALTER TABLE reward_entitlements ADD CONSTRAINT reward_entitlements_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // 7. Update users table for loyalty_points and ensure referral_points column
    console.log("7. Updating users cached balances...");
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_points integer NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_points integer NOT NULL DEFAULT 0;
    `);

    // 8. Update program_settings table
    console.log("8. Updating program_settings table...");
    await client.query(`
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS program_active boolean NOT NULL DEFAULT true;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS referral_points_per_qualified integer NOT NULL DEFAULT 100;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS loyalty_points_per_paid_order integer NOT NULL DEFAULT 10;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS loyalty_redemption_points integer NOT NULL DEFAULT 100;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS loyalty_reward_catalog_id uuid REFERENCES price_catalog(id) ON DELETE SET NULL;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS standard_reward_milestone_points integer NOT NULL DEFAULT 500;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS standard_reward_eligible_item_ids jsonb NOT NULL DEFAULT '[]';
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS standard_reward_max_cap_kes integer NOT NULL DEFAULT 300;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS exclusive_reward_milestone_points integer NOT NULL DEFAULT 1000;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS exclusive_reward_eligible_item_ids jsonb NOT NULL DEFAULT '[]';
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS exclusive_reward_max_cap_kes integer NOT NULL DEFAULT 450;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS annual_reward_cap_per_client integer NOT NULL DEFAULT 15;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS loyalty_points_expiry_months integer NOT NULL DEFAULT 12;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS referee_welcome_discount_active boolean NOT NULL DEFAULT false;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS referee_welcome_discount_kes integer NOT NULL DEFAULT 0;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS admin_alert_phone text DEFAULT '+254706351077';
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS auto_approve_low_risk boolean NOT NULL DEFAULT false;
      ALTER TABLE program_settings ADD COLUMN IF NOT EXISTS whatsapp_template_referral_share text;
    `);

    // 9. program_audit_log table (Append-only, strict permissions)
    console.log("9. Creating program_audit_log table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS program_audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action text NOT NULL,
        entity text NOT NULL,
        entity_id text NOT NULL,
        previous_state jsonb,
        new_state jsonb,
        step_up_method text,
        ip_hash text NOT NULL,
        user_agent text,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS program_audit_log_entity_idx ON program_audit_log (entity, entity_id);
      CREATE INDEX IF NOT EXISTS program_audit_log_actor_idx ON program_audit_log (actor_id);
      CREATE INDEX IF NOT EXISTS program_audit_log_created_idx ON program_audit_log (created_at);
    `);

    // 10. Populate initial active version of program_settings if needed
    console.log("10. Ensuring initial program_settings row with catalog item IDs...");
    const itemsRes = await client.query(`
      SELECT id, variant, category, price FROM price_catalog WHERE active = true
    `);
    const catalogRows = itemsRes.rows;

    const smallBasket = catalogRows.find((c: any) => c.variant.includes("Small Basket"));
    const singleDuvet = catalogRows.find((c: any) => c.variant.includes("Single / 3x5"));
    const smallMat = catalogRows.find((c: any) => c.variant.includes("Small Doormat"));
    const largeBasket = catalogRows.find((c: any) => c.variant.includes("Large Basket"));

    const standardItemIds = [smallBasket?.id, singleDuvet?.id, smallMat?.id].filter(Boolean);
    const exclusiveItemIds = [largeBasket?.id].filter(Boolean);

    await client.query(`
      INSERT INTO program_settings (
        version,
        program_active,
        referral_threshold,
        loyalty_threshold,
        min_order_value_kes,
        small_basket_price_kes,
        voucher_validity_days,
        hold_window_hours,
        referral_points_per_qualified,
        loyalty_points_per_paid_order,
        loyalty_redemption_points,
        loyalty_reward_catalog_id,
        standard_reward_milestone_points,
        standard_reward_eligible_item_ids,
        standard_reward_max_cap_kes,
        exclusive_reward_milestone_points,
        exclusive_reward_eligible_item_ids,
        exclusive_reward_max_cap_kes,
        annual_reward_cap_per_client,
        loyalty_points_expiry_months,
        referee_welcome_discount_active,
        referee_welcome_discount_kes,
        admin_alert_phone,
        auto_approve_low_risk,
        whatsapp_template_referral_share
      ) VALUES (
        COALESCE((SELECT MAX(version) + 1 FROM program_settings), 2),
        true,
        5,
        10,
        300,
        300,
        90,
        0,
        100,
        10,
        100,
        $1,
        500,
        $2::jsonb,
        300,
        1000,
        $3::jsonb,
        450,
        15,
        12,
        false,
        0,
        '+254706351077',
        false,
        'Hey! Get your laundry done professionally with WashFlow. Book using my link and get express pickup & delivery: {{shareUrl}}'
      )
    `, [smallBasket?.id || null, JSON.stringify(standardItemIds), JSON.stringify(exclusiveItemIds)]);

    // 11. Configure RLS on new tables for my_app
    console.log("11. Configuring RLS on new tables...");
    const rlsTables = [
      { name: "referral_codes", col: "user_id" },
      { name: "points_ledger", col: "client_id" },
      { name: "reward_entitlements", col: "client_id" },
    ];

    for (const t of rlsTables) {
      await client.query(`ALTER TABLE "${t.name}" ENABLE ROW LEVEL SECURITY;`);
      await client.query(`ALTER TABLE "${t.name}" FORCE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS "${t.name}_tenant_policy" ON "${t.name}";`);
      await client.query(`
        CREATE POLICY "${t.name}_tenant_policy" ON "${t.name}"
        FOR ALL
        TO my_app
        USING (
          ${t.col} = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          OR current_setting('app.is_admin', true) = 'true'
        )
        WITH CHECK (
          ${t.col} = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          OR current_setting('app.is_admin', true) = 'true'
        );
      `);
    }

    // Revoke UPDATE and DELETE on program_audit_log for my_app role (Append-only guarantee)
    await client.query(`
      GRANT SELECT, INSERT ON program_audit_log TO my_app;
      REVOKE UPDATE, DELETE, TRUNCATE ON program_audit_log FROM my_app;
    `);

    await client.query("COMMIT");
    console.log("✅ Phase 1 Schema Migration completed successfully!");
    process.exit(0);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
  }
}

migrate();
