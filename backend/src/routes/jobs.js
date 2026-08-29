const express = require('express');
const router = express.Router();
const { runQuery } = require('../db');

// GET /api/jobs — list all jobs (for dropdowns)
router.get('/', async (req, res, next) => {
  try {
    const records = await runQuery(
      `MATCH (j:Job) RETURN j.id AS id, j.name AS name, j.level AS level ORDER BY j.level, j.name`
    );
    res.json(
      records.map((r) => ({ id: r.get('id'), name: r.get('name'), level: r.get('level') }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id/requirements
// 2-hop traversal: Job -> required Skills -> Courses that teach each skill.
// This is the kind of "fan-out" query that needs two joins plus a group-by
// in SQL; here it's one readable pattern match.
router.get('/:id/requirements', async (req, res, next) => {
  try {
    const records = await runQuery(
      `
      MATCH (j:Job {id: $id})-[r:REQUIRES_SKILL]->(s:Skill)
      OPTIONAL MATCH (c:Course)-[:TEACHES_SKILL]->(s)
      RETURN j, s, r.importance AS importance, collect(DISTINCT c) AS courses
      `,
      { id: req.params.id }
    );
    if (!records.length) {
      return res.status(404).json({ error: 'Job not found or has no requirements' });
    }

    const job = records[0].get('j').properties;
    const nodesById = new Map();
    const edges = [];
    nodesById.set(job.id, { id: job.id, label: job.name, group: 'job' });

    records.forEach((rec) => {
      const skill = rec.get('s').properties;
      nodesById.set(skill.id, { id: skill.id, label: skill.name, group: 'skill' });
      edges.push({ from: job.id, to: skill.id, label: rec.get('importance') || 'requires' });

      rec.get('courses').forEach((c) => {
        if (!c) return;
        nodesById.set(c.properties.id, { id: c.properties.id, label: c.properties.name, group: 'course' });
        edges.push({ from: c.properties.id, to: skill.id, label: 'teaches' });
      });
    });

    res.json({ job: { id: job.id, name: job.name }, nodes: Array.from(nodesById.values()), edges });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
