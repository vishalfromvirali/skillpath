require('dotenv').config();
const neo4j = require('neo4j-driver');
const data = require('./seedData');

const uri = process.env.COGNODB_URI;
const user = process.env.COGNODB_USER || 'cognodb';
const password = process.env.COGNODB_PASSWORD;

if (!uri || !password) {
  console.error(
    'Missing COGNODB_URI or COGNODB_PASSWORD. Copy backend/.env.example to backend/.env and fill it in first.'
  );
  process.exit(1);
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

async function run(query, params = {}) {
  const session = driver.session();
  try {
    await session.run(query, params);
  } finally {
    await session.close();
  }
}

async function main() {
  console.log('Connecting to CognoDB...');
  await driver.verifyConnectivity();

  console.log('Clearing existing data...');
  await run('MATCH (n) DETACH DELETE n');

  console.log('Creating uniqueness constraints...');
  const constraints = [
    'CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE',
    'CREATE CONSTRAINT job_id IF NOT EXISTS FOR (j:Job) REQUIRE j.id IS UNIQUE',
    'CREATE CONSTRAINT course_id IF NOT EXISTS FOR (c:Course) REQUIRE c.id IS UNIQUE',
    'CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE',
  ];
  for (const c of constraints) {
    try {
      await run(c);
    } catch (e) {
      console.warn('  (constraint skipped — may already exist):', e.message);
    }
  }

  console.log(`Loading ${data.skills.length} skills...`);
  await run(`UNWIND $rows AS row CREATE (s:Skill {id: row.id, name: row.name})`, { rows: data.skills });

  console.log(`Loading ${data.jobs.length} jobs...`);
  await run(`UNWIND $rows AS row CREATE (j:Job {id: row.id, name: row.name, level: row.level})`, {
    rows: data.jobs,
  });

  console.log(`Loading ${data.courses.length} courses...`);
  await run(`UNWIND $rows AS row CREATE (c:Course {id: row.id, name: row.name})`, { rows: data.courses });

  console.log(`Loading ${data.people.length} people...`);
  await run(`UNWIND $rows AS row CREATE (p:Person {id: row.id, name: row.name})`, { rows: data.people });

  console.log(`Linking ${data.skillPrereqs.length} skill prerequisites...`);
  await run(
    `
    UNWIND $rows AS row
    MATCH (pre:Skill {id: row[0]}), (s:Skill {id: row[1]})
    CREATE (pre)-[:PREREQUISITE_OF]->(s)
    `,
    { rows: data.skillPrereqs }
  );

  console.log(`Linking ${data.courseTeaches.length} course -> skill edges...`);
  await run(
    `
    UNWIND $rows AS row
    MATCH (c:Course {id: row[0]}), (s:Skill {id: row[1]})
    CREATE (c)-[:TEACHES_SKILL]->(s)
    `,
    { rows: data.courseTeaches }
  );

  console.log(`Linking ${data.jobRequires.length} job -> skill requirements...`);
  await run(
    `
    UNWIND $rows AS row
    MATCH (j:Job {id: row[0]}), (s:Skill {id: row[1]})
    CREATE (j)-[:REQUIRES_SKILL {importance: row[2]}]->(s)
    `,
    { rows: data.jobRequires }
  );

  console.log(`Linking ${data.jobProgression.length} job progression edges...`);
  await run(
    `
    UNWIND $rows AS row
    MATCH (a:Job {id: row[0]}), (b:Job {id: row[1]})
    CREATE (a)-[:LEADS_TO]->(b)
    `,
    { rows: data.jobProgression }
  );

  console.log(`Linking ${data.personSkills.length} person -> skill edges...`);
  await run(
    `
    UNWIND $rows AS row
    MATCH (p:Person {id: row[0]}), (s:Skill {id: row[1]})
    CREATE (p)-[:HAS_SKILL {level: row[2]}]->(s)
    `,
    { rows: data.personSkills }
  );

  console.log(`Linking ${data.people.length} person -> current job edges...`);
  await run(
    `
    UNWIND $rows AS row
    MATCH (p:Person {id: row.id}), (j:Job {id: row.currentJob})
    CREATE (p)-[:WORKS_AS]->(j)
    `,
    { rows: data.people }
  );

  console.log('\nSeed complete! Graph summary:');
  console.log(`  ${data.skills.length} Skills, ${data.jobs.length} Jobs, ${data.courses.length} Courses, ${data.people.length} People`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await driver.close();
  });
