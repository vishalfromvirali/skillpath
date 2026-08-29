require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { verifyConnectivity } = require('./db');
const skillsRouter = require('./routes/skills');
const jobsRouter = require('./routes/jobs');
const peopleRouter = require('./routes/people');
const careerRouter = require('./routes/career');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',') }));
app.use(express.json());

// Health check — reports DB reachability explicitly rather than letting
// every route fail with a raw driver stack trace. The frontend polls this
// to show a clear "database unreachable" empty state instead of a blank page.
app.get('/api/health', async (req, res) => {
  try {
    await verifyConnectivity();
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable', message: err.message });
  }
});

app.use('/api/skills', skillsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/people', peopleRouter);
app.use('/api/career', careerRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralized error handler — every route calls next(err) on failure so a
// database timeout or bad query never crashes the process or leaks a raw
// stack trace to the client.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`SkillPath API listening on port ${PORT}`);
});
