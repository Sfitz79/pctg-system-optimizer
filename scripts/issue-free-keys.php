#!/usr/bin/env php
<?php
/**
 * PCTG LICENCE ISSUER - free Pro keys for testing, giveaways and bundled PCs.
 *
 * WHY THIS EXISTS INSTEAD OF A HARDCODED KEY IN THE APP
 * -----------------------------------------------------
 * The request was "a key that unlocks Pro so it can be handed out with the PCs we sell".
 * A hardcoded string was rejected for a specific, measured reason: this repo is PUBLIC and
 * the v1.3.0 release is downloadable by anyone, and app.asar is an ordinary zip. During
 * the pre-release audit a plaintext `genkey.js` - the whole tier/price table - was read
 * straight out of the shipped asar. A literal unlock key would be readable in minutes,
 * posted publicly, and would undo the licence-bypass work (SPECIAL_KEYS was removed
 * 2026-09-09; the env-var bypass was closed in d33d49b on 2026-10-11).
 *
 * A KEY IN THE DATABASE IS STRICTLY BETTER FOR THE SAME JOB:
 *   - it is per-customer, so ONE leaked key can be revoked without touching the rest
 *   - it is server-validated, so nothing about it is readable from the binary
 *   - it is auditable: every key records who issued it, why, and when
 *   - it costs nothing to make as many as you want
 *
 * THIS SCRIPT NEVER SHIPS. It lives in scripts/ of the SITE repo, not the app repo, and
 * scripts/ is stripped from the packaged app to *.ps1 only.
 *
 * IT WRITES TO REAL PRODUCTION DATA. It is therefore:
 *   - dry-run by DEFAULT. Nothing is written without --commit.
 *   - additive only. It INSERTs new rows and never updates or deletes an existing one.
 *   - every issued key is labelled with who/why, so the store stays self-explaining.
 *
 * USAGE
 *   php scripts/issue-free-keys.php --tier=pro --count=1 --reason="PC sale - Smith, invoice 4021"
 *   php scripts/issue-free-keys.php --tier=pro --count=25 --reason="October giveaway" --commit
 *   php scripts/issue-free-keys.php --list
 *
 * OPTIONS
 *   --tier=pro|standard|repair|fps|security|internet|winfix|deep   (default pro)
 *   --count=N          how many keys                                   (default 1)
 *   --reason=TEXT      REQUIRED. who/what this batch is for. Stored on every row.
 *   --customer=TEXT    optional. the person/machine the key is for.
 *   --no-hwid          optional. allow the key to re-bind on a different machine later
 *                      (a customer who reimplements Windows or changes motherboard).
 *                      Off by default: one key, one machine, which is what stops a
 *                      giveaway key being reused by whoever wins it twice.
 *   --commit           actually write. Without it, this only prints what it WOULD do.
 *   --list             show existing keys (key, tier, reason, bound?, activations)
 *
 * CONNECTION
 *   Uses the same Neon credentials pc-builder already has, read from
 *   pc-builder/.env.production.neon. Falls back to $NEON_DATABASE_URL.
 */

function parseArgs(array $argv): array {
    $out = ['tier' => 'pro', 'count' => 1, 'reason' => '', 'customer' => null, 'noHwid' => false, 'commit' => false, 'list' => false];
    foreach (array_slice($argv, 1) as $a) {
        if ($a === '--commit') { $out['commit'] = true; continue; }
        if ($a === '--no-hwid') { $out['noHwid'] = true; continue; }
        if ($a === '--list') { $out['list'] = true; continue; }
        if (preg_match('/^--([a-z-]+)=(.*)$/s', $a, $m)) {
            $k = str_replace('-', '', $m[1]);
            if ($k === 'tier') $out['tier'] = strtolower(trim($m[2]));
            elseif ($k === 'count') $out['count'] = (int)$m[2];
            elseif ($k === 'reason') $out['reason'] = trim($m[2]);
            elseif ($k === 'customer') $out['customer'] = trim($m[2]);
        }
    }
    return $out;
}

/** Must match the tier vocabulary api/shop-order.js sells and main.js understands. */
function knownTiers(): array {
    return ['pro', 'standard', 'repair', 'fps', 'security', 'internet', 'winfix', 'deep'];
}

function connect(): PDO {
    $envFile = __DIR__ . '/../../pc-builder/.env.production.neon';
    $kv = [];
    if (is_file($envFile)) {
        foreach (file($envFile, FILE_IGNORE_NEW_LINES) as $line) {
            if (preg_match('/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/', $line, $m) && !preg_match('/^\s*#/', $line)) {
                $kv[$m[1]] = trim($m[2], "\"'");
            }
        }
    }
    if (!empty($kv['DB_HOST'])) {
        $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s;sslmode=%s',
            $kv['DB_HOST'], $kv['DB_PORT'] ?? '5432', $kv['DB_DATABASE'], $kv['DB_SSLMODE'] ?? 'require');
        try {
            return new PDO($dsn, $kv['DB_USERNAME'], $kv['DB_PASSWORD'],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 20]);
        } catch (Throwable $e) {
            fwrite(STDERR, "  could not connect via .env.production.neon: " . $e->getMessage() . "\n");
        }
    }
    $url = getenv('NEON_DATABASE_URL') ?: getenv('DATABASE_URL');
    if (!$url) {
        fwrite(STDERR, "  No database credentials found. Set NEON_DATABASE_URL.\n");
        exit(1);
    }
    try {
        return new PDO($url, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 20]);
    } catch (Throwable $e) {
        fwrite(STDERR, "  could not connect: " . $e->getMessage() . "\n");
        exit(1);
    }
}

/**
 * Same shape as lib/licence-store.js newLicenceKey(): PCTG-XXXXXXXX-XXXXXXXX-XXXXXXXX,
 * uppercase hex, 4 bytes per segment. The shipped app parses this exact format, so a
 * different shape here would produce keys the customer app cannot read.
 */
function newKey(): string {
    $seg = fn() => strtoupper(bin2hex(random_bytes(4)));
    return 'PCTG-' . $seg() . '-' . $seg() . '-' . $seg();
}

$opt = parseArgs($argv);
$pdo = connect();

if ($opt['list']) {
    $rows = $pdo->query(
        "SELECT licence_key, tier, notes, bound_hwid, activations, created_at, revoked_at
           FROM pctl_licences ORDER BY id DESC LIMIT 200"
    )->fetchAll();
    printf("%-34s %-9s %-28s %-8s %-5s %s\n", 'KEY', 'TIER', 'REASON', 'BOUND', 'ACTS', 'CREATED');
    echo str_repeat('-', 110) . "\n";
    foreach ($rows as $r) {
        printf("%-34s %-9s %-28s %-8s %-5d %s\n",
            $r['licence_key'],
            $r['tier'],
            substr((string)$r['notes'], 0, 27),
            $r['bound_hwid'] ? 'yes' : 'no',
            (int)$r['activations'],
            substr((string)$r['created_at'], 0, 16));
        if ($r['revoked_at']) echo "    ^ REVOKED " . substr((string)$r['revoked_at'], 0, 16) . "\n";
    }
    echo "\n" . count($rows) . " row(s).\n";
    exit(0);
}

if (!in_array($opt['tier'], knownTiers(), true)) {
    fwrite(STDERR, "  Unknown tier '{$opt['tier']}'. Valid: " . implode(', ', knownTiers()) . "\n");
    exit(1);
}
if (trim($opt['reason']) === '') {
    fwrite(STDERR, "  --reason is REQUIRED.\n");
    fwrite(STDERR, "  Every free key is recorded with who issued it and why. A key with no\n");
    fwrite(STDERR, "  reason is indistinguishable from a sale later, which is exactly the thing\n");
    fwrite(STDERR, "  you need to be able to answer when someone claims a licence is free.\n");
    exit(1);
}
if ($opt['count'] < 1 || $opt['count'] > 500) {
    fwrite(STDERR, "  --count must be between 1 and 500.\n");
    exit(1);
}

echo "=== PCTG FREE LICENCE ISSUER ===\n\n";
printf("  tier        : %s\n", $opt['tier']);
printf("  count       : %d\n", $opt['count']);
printf("  reason      : %s\n", $opt['reason']);
if ($opt['customer']) printf("  customer    : %s\n", $opt['customer']);
printf("  hwid        : %s\n", $opt['noHwid'] ? 'may re-bind on a different machine' : 'locked to the first machine it activates on');
printf("  amount_gbp  : 0.00 (free - no payment reference)\n\n");

// Generate first, write second, so a key is never displayed unless it is storable.
$keys = [];
for ($i = 0; $i < $opt['count']; $i++) $keys[] = newKey();

if (!$opt['commit']) {
    echo "DRY RUN - nothing has been written. These are the keys that WOULD be issued:\n\n";
    foreach ($keys as $k) echo "  $k\n";
    echo "\nRe-run with --commit to actually create them.\n";
    exit(0);
}

$notes = $opt['reason'] . ($opt['customer'] ? ' | customer: ' . $opt['customer'] : '')
    . ' | issued-by-script' . ($opt['noHwid'] ? ' | nohwid' : '');

// One transaction: either the whole batch lands or none of it does.
$pdo->beginTransaction();
$written = [];
try {
    $stmt = $pdo->prepare(
        "INSERT INTO pctl_licences (licence_key, product, tier, payment_ref, amount_gbp, paypal_mode, notes)
         VALUES (:key, 'optimizer', :tier, NULL, 0.00, 'free', :notes)"
    );
    foreach ($keys as $k) {
        $stmt->execute([':key' => $k, ':tier' => $opt['tier'], ':notes' => $notes]);
        $written[] = $k;
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, "\n  FAILED, nothing was written: " . $e->getMessage() . "\n");
    exit(1);
}

echo "ISSUED " . count($written) . " key(s):\n\n";
foreach ($written as $k) echo "  $k\n";

// Prove they are really in the store rather than merely printed.
$chk = $pdo->prepare('SELECT tier FROM pctl_licences WHERE licence_key = ?');
$found = 0;
foreach ($written as $k) { $chk->execute([$k]); if ($chk->fetch()) $found++; }
echo "\n  verified in database : $found / " . count($written) . "\n";
echo "  total rows now       : " . $pdo->query('SELECT count(*) FROM pctl_licences')->fetchColumn() . "\n";

if ($found !== count($written)) {
    fwrite(STDERR, "\n  WARNING: not every key was found on read-back. Do not hand these out.\n");
    exit(1);
}
echo "\n  These validate through /api/validate like any paid licence.\n";
echo "  To revoke one later, set revoked_at on its row; the app reports it as revoked.\n";