const neo4j = require('neo4j-driver');

const uri = process.env.COGNODB_URI;
const user = process.env.COGNODB_USER || 'cognodb';
const password = process.env.COGNODB_PASSWORD;

if (!uri || !password) {
  // Don't crash on import — let /api/health report this clearly instead of
  // the whole process dying with a cryptic driver error.
  console.warn(
    '[db] COGNODB_URI or COGNODB_PASSWORD is not set. Copy backend/.env.example to backend/.env and fill it in.'
  );
}

const driver = neo4j.driver(
  uri || 'bolt://localhost:7687',
  neo4j.auth.basic(user, password || ''),
  {
    maxConnectionPoolSize: 20,
    connectionAcquisitionTimeout: 10000,
  }
);

async function verifyConnectivity() {
  await driver.verifyConnectivity();
}

function getSession() {
  return driver.session();
}

/**
 * Runs a single parameterized Cypher query and returns its records.
 * Always uses query parameters ($param) — never string-concatenated Cypher —
 * so user input can never be injected into the query itself.
 */
async function runQuery(query, params = {}) {
  const session = getSession();
  try {
    const result = await session.run(query, params);
    return result.records;
  } finally {
    await session.close();
  }
}

module.exports = { driver, getSession, runQuery, verifyConnectivity };
