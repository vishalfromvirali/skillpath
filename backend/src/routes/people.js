const express = require('express');
const router = express.Router();
const { runQuery } = require('../db');

// GET /api/people — list all people (for dropdowns)
router.get('/', async (req, res, next) => {
  try {
    const records = await runQuery(
      `MATCH (p:Person) RETURN p.id AS id, p.name AS name ORDER BY p.name`
    );
    res.json(records.map((r) => ({ id: r.get('id'), name: r.get('name') })));
  } catch (err) {
    next(err);
  }
});

// GET /api/people/:id/profile — a person's current job and skills (1-hop each)
router.get('/:id/profile', async (req, res, next) => {
  try {
    const records = await runQuery(
      `
      MATCH (p:Person {id: $id})
      OPTIONAL MATCH (p)-[hs:HAS_SKILL]->(s:Skill)
      OPTIONAL MATCH (p)-[:WORKS_AS]->(j:Job)
      RETURN p, collect(DISTINCT {skill: s, level: hs.level}) AS skills, j
      `,
      { id: req.params.id }
    );
    if (!records.length) return res.status(404).json({ error: 'Person not found' });

    const rec = records[0];
    const person = rec.get('p').properties;
    const jobNode = rec.get('j');
    const skills = rec
      .get('skills')
      .filter((s) => s.skill)
      .map((s) => ({ id: s.skill.properties.id, name: s.skill.properties.name, level: s.level }));

    res.json({
      id: person.id,
      name: person.name,
      currentJob: jobNode ? { id: jobNode.properties.id, name: jobNode.properties.name } : null,
      skills,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
