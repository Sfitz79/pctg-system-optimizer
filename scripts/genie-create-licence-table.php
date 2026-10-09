<?php
/**
 * CREATES THE LICENCE KEY TABLE FOR PCTG SYSTEM OPTIMIZER / CRIMSON OS.
 *
 * WHY A REAL DATABASE AND NOT THE EXISTING JSON "STORE"
 * -----------------------------------------------------
 * The licence store was two files:
 *   - api/server-keys.json, inside the deployment bundle. On Vercel that filesystem
 *     is READ ONLY, so a write can never persist. It also ships with the deployment,
 *     so it is a licence list one HTTP GET from public.
 *   - /tmp/pctg-keys-db.json. Ephemeral per instance and wiped constantly.
 * BOTH writes were wrapped in `catch {}`, so a paid customer was shown a key that
 * could never validate and nothing was reported. That is the failure that stops P2
 * being revenue, so the key store is being moved to Postgres where a write is a write.
 *
 * WHY THIS LIVES IN THE EXISTING NEON DATABASE
 * ---------------------------------------------
 * Neon is already provisioned, already paid for, and reachable from this machine
 * (verified 2026-10-09 - the egress that was blocked for a fortnight is now open).
 * Provisioning a second Neon project would need the Boss's account and cost money for
 * no benefit. A single additive table in the existing database is the smallest change
 * that actually fixes the problem.
 *
 * SAFE TO RUN MORE THAN ONCE - every statement is IF NOT EXISTS.
 *
 * Usage: php scripts/genie-create-licence-table.php
 */
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

echo "=== PCTG LICENCE STORE SCHEMA ===\n\n";

$driver = DB::connection()->getDriverName();
echo "driver : {$driver}\n";
if ($driver === 'sqlite') {
    fwrite(STDERR, "\nThis is SQLITE. The licence store must be created on the real Postgres\n");
    fwrite(STDERR, "database or a customer key written here will be lost.\n");
    exit(1);
}

DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS pctl_licences (
    id              BIGSERIAL PRIMARY KEY,
    licence_key     TEXT        NOT NULL UNIQUE,
    product         TEXT        NOT NULL DEFAULT 'optimizer',
    tier            TEXT        NOT NULL DEFAULT 'standard',
    payment_ref     TEXT        NULL,
    amount_gbp      NUMERIC(10,2) NULL,
    paypal_mode     TEXT        NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    first_activated_at TIMESTAMPTZ NULL,
    bound_hwid      TEXT        NULL,
    activations     INTEGER     NOT NULL DEFAULT 0,
    revoked_at      TIMESTAMPTZ NULL,
    notes           TEXT        NULL
);
SQL);

DB::unprepared('CREATE INDEX IF NOT EXISTS pctl_licences_hwid_idx ON pctl_licences (bound_hwid);');
DB::unprepared('CREATE INDEX IF NOT EXISTS pctl_licences_product_idx ON pctl_licences (product, created_at DESC);');

echo "\ncreated/ensured:\n";
foreach (['pctl_licences', 'pctl_licences_hwid_idx', 'pctl_licences_product_idx'] as $t) {
    $exists = DB::selectOne("SELECT to_regclass('public.{$t}') AS reg");
    printf("  %-28s %s\n", $t, $exists->reg ? 'OK' : 'MISSING');
}

$cols = DB::select("SELECT column_name FROM information_schema.columns WHERE table_name='pctl_licences' ORDER BY ordinal_position");
echo "\ncolumns: " . implode(', ', array_map(fn ($c) => $c->column_name, $cols)) . "\n";
echo "\nrows currently: " . DB::table('pctl_licences')->count() . " (expected 0 - the old JSON store held one DEMO key, deliberately not migrated)\n";
echo "\nDONE. No application data was read or modified.\n";
