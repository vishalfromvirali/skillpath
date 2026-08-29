const express = require('express');
const router = express.Router();
const { runQuery } = require('../db');
const { toNumber } = require('../neo4jUtil');

// GET /api/career/path?from=jobId&to=jobId
//
// Variable-length multi-hop traversal along :LEADS_TO edges to find the
// shortest realistic career progression between two roles. The hop count
// isn't known ahead of time (2 steps for some pairs, 4+ for others), which
// is exactly the kind of query a relational schema struggles with — you'd
// need either a fixed number of self-joins or a recursive CTE per depth,
// whereas here it's a single variable-length pattern.
router.get('/path', async (req, res, next) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'Query params "from" and "to" (job ids) are required' });
  }
  try {
    const records = await runQuery(
      `
      MATCH (start:Job {id: $from}), (end:Job {id: $to})
      MATCH path = shortestPath((start)-[:LEADS_TO*1..6]->(end))
      RETURN [n IN nodes(path) | {id: n.id, name: n.name}] AS jobs, length(path) AS hops
      `,
      { from, to }
    );
    if (!records.length) {
      return res.json({
        found: false,
        message: 'No direct progression path found between these two roles.',
      });
    }
    const rec = records[0];
    res.json({ found: true, hops: toNumber(rec.get('hops')), jobs: rec.get('jobs') });
  } catch (err) {
    next(err);
  }
});

// GET /api/career/gap?personId=&jobId=
//
// Skill-gap analysis: for a target job, which required skills does this
// person already have, which are missing, and which courses teach each
// missing skill. This chains a set-difference (skills required MINUS skills
// held) with a third relationship type (courses) in one pass — in SQL this
// is a LEFT JOIN, a NOT EXISTS subquery, and a second LEFT JOIN, all at once.
router.get('/gap', async (req, res, next) => {
  const { personId, jobId } = req.query;
  if (!personId || !jobId) {
    return res.status(400).json({ error: 'Query params "personId" and "jobId" are required' });
  }
  try {
    const records = await runQuery(
      `
      MATCH (p:Person {id: $personId})
      MATCH (j:Job {id: $jobId})-[:REQUIRES_SKILL]->(req:Skill)
      WITH p, j, req, exists((p)-[:HAS_SKILL]->(req)) AS alreadyHave
      OPTIONAL MATCH (c:Course)-[:TEACHES_SKILL]->(req)
      WITH j, req, alreadyHave, collect(DISTINCT c.name) AS courses
      RETURN j.name AS jobName,
             collect({skill: req.name, alreadyHave: alreadyHave, courses: courses}) AS breakdown
      `,
      { personId, jobId }
    );
    if (!records.length) {
      return res.status(404).json({ error: 'No requirements found for this job, or job/person does not exist' });
    }
    const rec = records[0];
    const breakdown = rec.get('breakdown');
    const have = breakdown.filter((b) => b.alreadyHave);
    const missing = breakdown.filter((b) => !b.alreadyHave);
    res.json({ job: rec.get('jobName'), have, missing, haveCount: have.length, missingCount: missing.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/career/mentors?personId=&targetJobId=
//
// Finds people already working the target job who share the most skills
// with this person, ranked by overlap — a 2-hop "friend of a friend" style
// pattern (Person -> Skill <- Person -> Job) with aggregation and ranking
// baked into the traversal itself.
router.get('/mentors', async (req, res, next) => {
  const { personId, targetJobId } = req.query;
  if (!personId || !targetJobId) {
    return res.status(400).json({ error: 'Query params "personId" and "targetJobId" are required' });
  }
  try {
    const records = await runQuery(
      `
      MATCH (p:Person {id: $personId})-[:HAS_SKILL]->(shared:Skill)<-[:HAS_SKILL]-(mentor:Person)-[:WORKS_AS]->(j:Job {id: $targetJobId})
      WHERE mentor.id <> $personId
      RETURN mentor.id AS id, mentor.name AS name, count(DISTINCT shared) AS sharedSkillCount,
             collect(DISTINCT shared.name) AS sharedSkills
      ORDER BY sharedSkillCount DESC
      LIMIT 5
      `,
      { personId, targetJobId }
    );
    res.json(
      records.map((r) => ({
        id: r.get('id'),
        name: r.get('name'),
        sharedSkillCount: toNumber(r.get('sharedSkillCount')),
        sharedSkills: r.get('sharedSkills'),
      }))
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
