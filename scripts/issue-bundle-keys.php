#!/usr/bin/env php
<?php
/**
 * PKG-ISH BUNDLE HELPER - one free Pro key per PC you sell, printed as a card.
 *
 * This is a thin wrapper over scripts/issue-free-keys.php. It exists because issuing a
 * key per machine is repetitive and, done by hand across a batch, easy to get wrong:
 * the count drifts from the number of machines, or the reason gets typed differently
 * every time and the store stops being auditable.
 *
 * It reads a plain list of customers (one per line, optionally "Name <email>") and issues
 * exactly one key per line, each stamped with that customer's name. Same safety rules as
 * the underlying tool: dry-run by default, additive only, requires --commit.
 *
 * USAGE
 *   php scripts/issue-bundle-keys.php --list=customers.txt --reason="PC build 4021 - bundled Pro"
 *   php scripts/issue-bundle-keys.php --list=customers.txt --reason="..." --commit
 *
 * OPTIONS
 *   --no-hwid   the key may re-bind if the customer reimplements Windows or changes
 *               motherboard. USE THIS for bundled PCs - you already know and trust the
 *               owner, and locking them out of software they were given with the machine
 *               generates support calls, not revenue.
 *   --out=FILE  write the key cards to a file as well as stdout.
 */

$opt = ['list' => null, 'reason' => '', 'noHwid' => false, 'commit' => false, 'out' => null];
foreach (array_slice($argv, 1) as $a) {
    if ($a === '--commit') { $opt['commit'] = true; continue; }
    if ($a === '--no-hwid') { $opt['noHwid'] = true; continue; }
    if (preg_match('/^--([a-z-]+)=(.*)$/s', $a, $m)) {
        $k = $m[1];
        if ($k === 'list') $opt['list'] = $m[2];
        elseif ($k === 'reason') $opt['reason'] = trim($m[2]);
        elseif ($k === 'out') $opt['out'] = $m[2];
    }
}

if (!$opt['list']) {
    fwrite(STDERR, "  --list=FILE is required (one customer per line).\n"); exit(1);
}
if (trim($opt['reason']) === '') {
    fwrite(STDERR, "  --reason is REQUIRED.\n"); exit(1);
}
if (!is_file($opt['list'])) {
    fwrite(STDERR, "  Cannot read list file: {$opt['list']}\n"); exit(1);
}

$lines = array_values(array_filter(array_map('trim', file($opt['list'], FILE_IGNORE_NEW_LINES))));
$customers = [];
foreach ($lines as $l) {
    // Strip a UTF-8 BOM before any other check. Windows PowerShell writes the first line
    // of a here-string with a BOM, so the comment marker on line 1 arrived as
    // "\uFEFF# PCs sold..." - the str_starts_with('#') test missed it and the script
    // offered to issue a licence to a comment. Comments are stripped AFTER the BOM,
    // and the result is verified rather than assumed.
    $l = preg_replace('/^\xEF\xBB\xBF/', '', $l);
    $l = trim($l);
    if ($l === '' || $l[0] === '#') continue;
    $name = trim(preg_replace('/<.*>/', '', $l));
    $customers[] = $name !== '' ? $name : $l;
}
if (!$customers) { fwrite(STDERR, "  List file has no customers.\n"); exit(1); }
if (count($customers) > 200) {
    fwrite(STDERR, "  " . count($customers) . " customers is above the 200 limit. Split the batch.\n"); exit(1);
}

echo "=== BUNDLE KEYS FOR SOLD PCS ===\n\n";
printf("  customers   : %d\n", count($customers));
printf("  reason      : %s\n", $opt['reason']);
printf("  hwid        : %s\n", $opt['noHwid']
    ? 'may re-bind - RECOMMENDED for a machine you sold them'
    : 'locked to the first machine (use --no-hwid for bundled PCs)');

if (!$opt['commit']) {
    echo "\nDRY RUN. Issue one key per line:\n\n";
    foreach ($customers as $i => $c) printf("  %-3d %s\n", $i + 1, $c);
    echo "\nRe-run with --commit to actually issue.\n";
    exit(0);
}

$script = __DIR__ . '/issue-free-keys.php';
$cards = [];
$n = 0;
foreach ($customers as $c) {
    $cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script)
        . ' --tier=pro --count=1 --reason=' . escapeshellarg($opt['reason'])
        . ' --customer=' . escapeshellarg($c)
        . ($opt['noHwid'] ? ' --no-hwid' : '')
        . ' --commit';
    $out = shell_exec($cmd);
    if ($out === null || !preg_match('/(PCTG-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8})/', $out, $m)) {
        fwrite(STDERR, "  FAILED for '{$c}' - aborting so you do not hand out a missing key.\n");
        fwrite(STDERR, "  Any keys already issued above are still valid; re-run the list without those.\n");
        exit(1);
    }
    $cards[] = ['customer' => $c, 'key' => $m[1]];
    $n++;
}
printf("\n  issued %d key(s)\n\n", $n);
foreach ($cards as $c) printf("  %-32s %s\n", $c['customer'], $c['key']);

if ($opt['out']) {
    $body = "PCTG System Optimizer Pro - bundled with your PC\n";
    $body .= "====================================================\n\n";
    foreach ($cards as $c) {
        $body .= "Licence key : {$c['key']}\n";
        $body .= "            : Pro, unlimited use, no expiry\n";
        $body .= "            : included with your PCTechGuy build\n\n";
    }
    $body .= "Enter this key when the app asks for a licence.\n";
    $body .= "Questions: info@pctechguyonline.com\n";
    file_put_contents($opt['out'], $body);
    printf("\n  cards written to %s\n", $opt['out']);
}
echo "\n  Each key validates through /api/validate like a paid licence.\n";
echo "  Revoke one later by setting revoked_at on its row.\n";