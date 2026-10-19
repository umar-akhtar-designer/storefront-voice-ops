<?php
/**
 * Voice Ops API — single-file drop-in for a custom PHP + MySQL website.
 *
 * SPEC: docs/store-connection-guide.md (section C) in the Voice Ops project.
 *
 * Install (Hostinger):
 *   1. Create a folder like  public_html/voice-api/
 *   2. Upload this file there as voice-ops-api.php
 *   3. Fill DATABASE CONFIG and API KEY below (both from the Hostinger panel)
 *   4. Send your operator:  https://your-domain.com/voice-api/voice-ops-api.php
 *      plus the API key you invented
 *   5. (Security) Once live, delete the ?tables=check diagnostic or leave it —
 *      it is key-protected and read-only.
 *
 * URLs the operator app will call (the .php form is enough):
 *   .../voice-ops-api.php/orders?status=pending&limit=20
 *   .../voice-ops-api.php/orders/1002
 *   .../voice-ops-api.php/products?lowStockBelow=10
 *   POST .../voice-ops-api.php/orders/1002/fulfill      {"tracking":"TCS-77","carrier":"TCS"}
 *   POST .../voice-ops-api.php/orders/1002/cancel       {"reason":"Customer changed mind"}
 *   POST .../voice-ops-api.php/products/SKU/restock     {"quantity":20,"mode":"set"}
 *   GET  .../voice-ops-api.php/sales/today              (optional)
 *   GET  .../voice-ops-api.php/tables                   (setup diagnostic)
 *
 * Every request needs the header:   x-api-key: <your key here>
 */

/* =========================== DATABASE CONFIG ============================ */
/* Copy these from Hostinger → Websites/Databases, or from your site's own
 * existing config file (same values the site already uses).               */
define('DB_HOST', 'localhost');
define('DB_NAME', 'u123456789_dbname'); // ← your database name
define('DB_USER', 'u123456789_user');   // ← your database user
define('DB_PASS', 'your-password');     // ← your database password

/* A secret only you and the operator app know. Invent something long:
 * e.g. 'voiceops_a7f3b91c44e2d806f5a1b2c3d4e5f607'                        */
define('API_KEY', 'REPLACE_WITH_LONG_RANDOM_KEY');

/* ==================== TABLE / COLUMN NAMES ==============================
 * Your database has its own table names and column names. The developer
 * adapts ONLY this block (and the map_order / map_product functions below)
 * so that the SQL matches your real schema. Nothing else changes.
 *
 * Example guesses you may need to rename:
 *   orders table:      ws_orders  /  orders  /  tbl_orders
 *   products table:    ws_products / products
 */
$T = [
    'orders_table'      => 'orders',
    'orders_id'         => 'id',              // order-number column
    'orders_created_at' => 'created_at',
    'orders_status'     => 'status',          // pending/shipped/delivered/cancelled
    'orders_total'      => 'total',
    'orders_customer_name' => 'customer_name',
    'orders_customer_phone' => 'customer_phone',
    'orders_customer_email' => 'customer_email',
    'orders_tracking'   => 'tracking_number',
    'orders_reason'     => 'cancelled_reason',

    'items_table'       => 'order_items',     // may not exist in your DB
    'items_order_id'    => 'order_id',
    'items_sku'         => 'sku',
    'items_name'        => 'name',
    'items_qty'         => 'quantity',
    'items_unit_price'  => 'unit_price',

    'products_table'    => 'products',
    'products_sku'      => 'sku',
    'products_name'     => 'name',
    'products_stock'    => 'stock',
    'products_price'    => 'price',
];

/* ============================ END OF CONFIG ============================= */

/* ---------------------------- helpers ----------------------------------- */
function json_out($status, $body): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($body);
    exit;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER,
                DB_PASS,
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
            );
        } catch (PDOException $e) {
            json_out(500, ['error' => 'DB connection failed']);
        }
    }
    return $pdo;
}

/* One row from ANY table shape → the JSON the operator app understands. */
function map_order(array $r, array $items = []): array {
    global $T;
    $status = strtolower((string)$r[$T['orders_status']]);
    $tracked = $status === 'shipped';
    return [
        'id'           => (string)$r[$T['orders_id']],
        'createdAt'    => (string)$r[$T['orders_created_at']],
        'status'       => $status,
        'total'        => ['amount' => round((float)$r[$T['orders_total']], 2), 'currency' => CURRENCY_CODE],
        'customerName' => (string)($r[$T['orders_customer_name']] ?? ''),
        'customerPhone'=> (string)($r[$T['orders_customer_phone']] ?? ''),
        'customerEmail'=> (string)($r[$T['orders_customer_email']] ?? ''),
        'trackingNumber' => $tracked ? (string)($r[$T['orders_tracking']] ?? '') : null,
        'cancelledReason'=> $status === 'cancelled' ? (string)($r[$T['orders_reason']] ?? '') : null,
        'items'        => $items,
    ];
}

function map_product(array $r): array {
    global $T;
    return [
        'sku'   => (string)$r[$T['products_sku']],
        'name'  => (string)$r[$T['products_name']],
        'stock' => (int)$r[$T['products_stock']],
        'price' => ['amount' => round((float)$r[$T['products_price']], 2), 'currency' => CURRENCY_CODE],
    ];
}

define('CURRENCY_CODE', 'PKR'); // ← change if the store sells in another currency

/* ------------------------- route handling ------------------------------- */
/* Accept the secret EITHER as the x-api-key header (how the operator app sends
 * it) OR as ?key=... in the URL (so you can test in a normal browser). */
$secret = $_SERVER['HTTP_X_API_KEY'] ?? ($_GET['key'] ?? '');
if (!hash_equals(API_KEY, $secret)) {
    json_out(401, ['error' => 'Missing or wrong x-api-key header']);
}

/* Strip everything up to (and including) this file's basename, whatever
 * prefix the hosting puts in front of it (folder, index.php rewrite, etc). */
$script_name = basename($_SERVER['SCRIPT_NAME']);
$uri = strtok($_SERVER['REQUEST_URI'] ?? '', '?') ?: '';
$pos = stripos($uri, $script_name);
if ($pos !== false) {
    $uri = substr($uri, $pos + strlen($script_name));
}
$path = trim($uri, '/');
$parts = $path === '' ? [] : explode('/', $path);
/* If the URL still contains a leading prefix (folder/file name), slice the
 * segments from the first known route word: /orders, /products or /sales. */
$roots = ['orders', 'products', 'sales', 'tables'];
foreach ($parts as $i => $seg) {
    if (in_array($seg, $roots, true)) {
        $parts = array_slice($parts, $i);
        break;
    }
}
$method = $_SERVER['REQUEST_METHOD'];
$body = $method === 'POST'
    ? (json_decode((string)file_get_contents('php://input'), true) ?? [])
    : [];

try {
    global $T;

    /* GET /tables — setup diagnostic: shows your real table+column names. */
    if ($parts === ['tables']) {
        $rows = [];
        foreach ([$T['orders_table'], $T['items_table'], $T['products_table']] as $t) {
            $q = db()->prepare("SHOW COLUMNS FROM `" . str_replace('`', '', $t) . "`");
            try {
                $q->execute();
                $rows[$t] = array_column($q->fetchAll(), 'Field');
            } catch (PDOException $e) {
                $rows[$t] = 'NOT FOUND — rename in $T config';
            }
        }
        json_out(200, $rows);
    }

    /* GET /orders?status=pending&limit=20 */
    if ($parts === ['orders'] && $method === 'GET') {
        $limit = min(max((int)($_GET['limit'] ?? 20), 1), 100);
        $where = '';
        $params = [];
        if (!empty($_GET['status'])) {
            // The app counts "pending" exactly like the seller's own dashboard Pending tab —
            // e.g. Confirmed/Packaging orders are a different tab there, not Pending.
            $where = 'WHERE LOWER(' . $T['orders_status'] . ') = ?';
            $params[] = strtolower((string)$_GET['status']);
        }
        $sql = "SELECT * FROM {$T['orders_table']} $where ORDER BY {$T['orders_created_at']} DESC LIMIT $limit";
        $q = db()->prepare($sql);
        $q->execute($params);
        $items = [];
        if (!empty($T['items_table'])) {
            $iq = db()->prepare("SELECT * FROM {$T['items_table']} WHERE {$T['items_order_id']} = ?");
        }
        $out = [];
        foreach ($q->fetchAll() as $row) {
            $line = [];
            if (!empty($T['items_table'])) {
                $iq->execute([$row[$T['orders_id']]]);
                foreach ($iq->fetchAll() as $li) {
                    $line[] = [
                        'sku' => (string)($li[$T['items_sku']] ?? ''),
                        'name' => (string)($li[$T['items_name']] ?? ''),
                        'quantity' => (int)($li[$T['items_qty']] ?? 1),
                        'unitPrice' => ['amount' => round((float)($li[$T['items_unit_price']] ?? 0), 2), 'currency' => CURRENCY_CODE],
                    ];
                }
            }
            $out[] = map_order($row, $line);
        }
        json_out(200, ['items' => $out]);
    }

    /* GET /orders/{id} */
    if (count($parts) === 2 && $parts[0] === 'orders' && $method === 'GET') {
        $q = db()->prepare("SELECT * FROM {$T['orders_table']} WHERE {$T['orders_id']} = ?");
        $q->execute([$parts[1]]);
        $row = $q->fetch();
        if (!$row) json_out(404, ['error' => "Order {$parts[1]} not found"]);
        json_out(200, map_order($row));
    }

    /* POST /orders/{id}/fulfill */
    if (count($parts) === 3 && $parts[0] === 'orders' && $parts[2] === 'fulfill' && $method === 'POST') {
        $q = db()->prepare("SELECT * FROM {$T['orders_table']} WHERE {$T['orders_id']} = ?");
        $q->execute([$parts[1]]);
        $order = $q->fetch();
        if (!$order) json_out(404, ['error' => "Order {$parts[1]} not found"]);
        if (strtolower($order[$T['orders_status']]) === 'cancelled') {
            json_out(409, ['error' => 'Cannot fulfil a cancelled order']);
        }
        $tracking = (string)($body['tracking'] ?? 'MANUAL-' . time());
        $q = db()->prepare("UPDATE {$T['orders_table']} SET {$T['orders_status']} = 'shipped', {$T['orders_tracking']} = ? WHERE {$T['orders_id']} = ?");
        $q->execute([$tracking, $parts[1]]);
        $q = db()->prepare("SELECT * FROM {$T['orders_table']} WHERE {$T['orders_id']} = ?");
        $q->execute([$parts[1]]);
        json_out(200, map_order($q->fetch()));
    }

    /* POST /orders/{id}/cancel */
    if (count($parts) === 3 && $parts[0] === 'orders' && $parts[2] === 'cancel' && $method === 'POST') {
        $q = db()->prepare("SELECT * FROM {$T['orders_table']} WHERE {$T['orders_id']} = ?");
        $q->execute([$parts[1]]);
        $order = $q->fetch();
        if (!$order) json_out(404, ['error' => "Order {$parts[1]} not found"]);
        if (strtolower($order[$T['orders_status']]) === 'shipped') {
            json_out(409, ['error' => 'Shipped order cannot be cancelled']);
        }
        $reason = (string)($body['reason'] ?? 'No reason given');
        $q = db()->prepare("UPDATE {$T['orders_table']} SET {$T['orders_status']} = 'cancelled', {$T['orders_reason']} = ? WHERE {$T['orders_id']} = ?");
        $q->execute([$reason, $parts[1]]);
        $q = db()->prepare("SELECT * FROM {$T['orders_table']} WHERE {$T['orders_id']} = ?");
        $q->execute([$parts[1]]);
        json_out(200, map_order($q->fetch()));
    }

    /* GET /products?lowStockBelow=10 */
    if ($parts === ['products'] && $method === 'GET') {
        $where = '';
        $params = [];
        if (isset($_GET['lowStockBelow'])) {
            $where = "WHERE {$T['products_stock']} <= ?";
            $params[] = (int)$_GET['lowStockBelow'];
        }
        $q = db()->prepare("SELECT * FROM {$T['products_table']} $where ORDER BY {$T['products_stock']} ASC LIMIT 250");
        $q->execute($params);
        json_out(200, ['items' => array_map('map_product', $q->fetchAll())]);
    }

    /* POST /products/{sku}/restock */
    if (count($parts) === 3 && $parts[0] === 'products' && $parts[2] === 'restock' && $method === 'POST') {
        $q = db()->prepare("SELECT * FROM {$T['products_table']} WHERE {$T['products_sku']} = ? LIMIT 1");
        $q->execute([$parts[1]]);
        $product = $q->fetch();
        if (!$product) json_out(404, ['error' => "No product with SKU {$parts[1]}"]);
        $quantity = $body['quantity'] ?? null;
        if (!is_numeric($quantity) || $quantity < 0) {
            json_out(400, ['error' => 'quantity must be a non-negative number']);
        }
        $newStock = (($body['mode'] ?? 'set') === 'add')
            ? (int)$product[$T['products_stock']] + (int)$quantity
            : (int)$quantity;
        $q = db()->prepare("UPDATE {$T['products_table']} SET {$T['products_stock']} = ? WHERE {$T['products_sku']} = ?");
        $q->execute([$newStock, $parts[1]]);
        $product[$T['products_stock']] = $newStock;
        json_out(200, map_product($product));
    }

    /* GET /sales/today */
    if ($parts === ['sales', 'today'] && $method === 'GET') {
        $today = date('Y-m-d');
        $q = db()->prepare("SELECT COALESCE(SUM({$T['orders_total']}),0) AS revenue, COUNT(*) AS orders
                            FROM {$T['orders_table']}
                            WHERE DATE({$T['orders_created_at']}) = ?");
        $q->execute([$today]);
        $row = $q->fetch() ?: ['revenue' => 0, 'orders' => 0];
        json_out(200, [
            'date'       => $today,
            'revenue'    => ['amount' => round((float)$row['revenue'], 2), 'currency' => CURRENCY_CODE],
            'orders'     => (int)$row['orders'],
            'topSellers' => [],
        ]);
    }

    json_out(404, ['error' => 'Unknown endpoint']);
} catch (PDOException $e) {
    json_out(500, ['error' => 'Database error']);
}
