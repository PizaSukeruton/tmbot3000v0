// utils/generateHexId.js
// Hex-only ID generator with race-safe init + row locking.
// Requires a table: hex_id_counters(id_type TEXT PRIMARY KEY, current_value INTEGER NOT NULL, last_used_id TEXT)
const pool = require('../db/pool');
// Add/adjust ranges here. Example includes a dedicated block for tour-manager terms.
const HEX_RANGES = Object.freeze({
  tm_term_id: { start: 0x604000, end: 0x6043E7 }, // 1000 slots for tour-manager lexicon
  // (Optional) Keep or add other ranges as needed:
  // conversation_id: { start: 0x900000, end: 0x9FFFFF },
  // aok_entry: { start: 0x600000, end: 0x6003E7 },
  // ...
});
function toHex6(n) {
  return `#${Number(n).toString(16).toUpperCase().padStart(6, '0')}`;
}
/**
 * Generate a unique hex ID for the given idType.
 * Strategy:
 *   1) INSERT seed row if missing (current_value = start-1) with ON CONFLICT DO NOTHING
 *   2) SELECT ... FOR UPDATE to lock the row
 *   3) Increment, range-check, UPDATE, COMMIT
 * First returned ID == start (clean semantics).
 *
 * @param {string} idType - key in HEX_RANGES (e.g., 'tm_term_id')
 * @returns {Promise<string>} hex ID like '#604000'
 */
async function generateHexId(idType) {
  const range = HEX_RANGES[idType];
  if (!range) {
    throw new Error(`Invalid idType "${idType}". Valid types: ${Object.keys(HEX_RANGES).join(', ')}`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Seed row (race-safe)
    const seedValue = range.start - 1;
    await client.query(
      `
      INSERT INTO hex_id_counters (id_type, current_value, last_used_id)
      VALUES ($1, $2, NULL)
      ON CONFLICT (id_type) DO NOTHING
      `,
      [idType, seedValue]
    );
    // Lock the counter row
    const { rows } = await client.query(
      `SELECT current_value FROM hex_id_counters WHERE id_type = $1 FOR UPDATE`,
      [idType]
    );
    if (rows.length === 0) {
      throw new Error(`Failed to initialize counter for idType="${idType}"`);
    }
    const current = Number(rows[0].current_value);
    const next = current + 1;
    if (next > range.end) {
      throw new Error(
        `Hex ID range exhausted for "${idType}". Max: ${toHex6(range.end)}`
      );
    }
    const hexId = toHex6(next);
    await client.query(
      `
      UPDATE hex_id_counters
      SET current_value = $1, last_used_id = $2
      WHERE id_type = $3
      `,
      [next, hexId, idType]
    );
    await client.query('COMMIT');
    return hexId;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error(`generateHexId error (${idType}):`, err.stack || err.message);
    throw err;
  } finally {
    client.release();
  }
}
module.exports = { generateHexId, HEX_RANGES };
