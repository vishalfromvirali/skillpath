const express = require('express');
const router = express.Router();
const { runQuery } = require('../db');

// GET /api/skills — list all skills (for dropdowns)
router.get('/', async (req, res, next) => {
  try {
    const records = await runQuery(
      `MATCH (s:Skill) RETURN s.id AS id, s.name AS name ORDER BY s.name`
    );
    res.json(records.map((r) => ({ id: r.get('id'), name: r.get('name') })));
  } catch (err) {
    next(err);
  }
});

// GET /api/skills/:id/graph
// 2-hop neighborhood of a single skill: what teaches it, what requires it,
// and what leads up to it — returned as a nodes/edges pair the frontend can
// hand straight to a network-graph renderer.
router.get('/:id/graph', async (req, res, next) => {
  try {
    const records = await runQuery(
      `
      MATCH (s:Skill {id: $id})
      OPTIONAL MATCH (pre:Skill)-[:PREREQUISITE_OF]->(s)
      OPTIONAL MATCH (c:Course)-[:TEACHES_SKILL]->(s)
      OPTIONAL MATCH (j:Job)-[:REQUIRES_SKILL]->(s)
      RETURN s,
             collect(DISTINCT pre) AS prereqs,
             collect(DISTINCT c) AS courses,
             collect(DISTINCT j) AS jobs
      `,
      { id: req.params.id }
    );
    if (!records.length) return res.status(404).json({ error: 'Skill not found' });

    const rec = records[0];
    const skill = rec.get('s').properties;
    const nodes = [{ id: skill.id, label: skill.name, group: 'skill' }];
    const edges = [];

    rec.get('prereqs').forEach((p) => {
      if (!p) return;
      nodes.push({ id: p.properties.id, label: p.properties.name, group: 'skill' });
      edges.push({ from: p.properties.id, to: skill.id, label: 'leads to' });
    });
    rec.get('courses').forEach((c) => {
      if (!c) return;
      nodes.push({ id: c.properties.id, label: c.properties.name, group: 'course' });
      edges.push({ from: c.properties.id, to: skill.id, label: 'teaches' });
    });
    rec.get('jobs').forEach((j) => {
      if (!j) return;
      nodes.push({ id: j.properties.id, label: j.properties.name, group: 'job' });
      edges.push({ from: j.properties.id, to: skill.id, label: 'requires' });
    });

    res.json({ nodes, edges });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
