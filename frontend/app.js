const API = window.API_BASE;

// ---------- tiny fetch helper ----------
async function api(path) {
  const res = await fetch(`${API}${path}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.message || `Request failed (${res.status})`);
  return body;
}

// ---------- health check ----------
async function checkHealth() {
  const pill = document.getElementById('statusPill');
  try {
    const health = await api('/health');
    if (health.status === 'ok') {
      pill.textContent = 'Database connected';
      pill.className = 'status-pill status-ok';
    } else {
      throw new Error(health.message || 'unreachable');
    }
  } catch (err) {
    pill.textContent = 'Database unreachable';
    pill.className = 'status-pill status-error';
  }
}

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
  });
});

// ---------- populate dropdowns ----------
function fillSelect(el, items, placeholder) {
  el.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = placeholder;
  el.appendChild(ph);
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    el.appendChild(opt);
  });
}

async function loadDropdowns() {
  try {
    const [jobs, skills, people] = await Promise.all([api('/jobs'), api('/skills'), api('/people')]);

    fillSelect(document.getElementById('exploreJobSelect'), jobs, 'Choose a job…');
    fillSelect(document.getElementById('exploreSkillSelect'), skills, 'Choose a skill…');

    fillSelect(document.getElementById('pathFrom'), jobs, 'Choose a role…');
    fillSelect(document.getElementById('pathTo'), jobs, 'Choose a role…');

    fillSelect(document.getElementById('gapPerson'), people, 'Choose a person…');
    fillSelect(document.getElementById('gapJob'), jobs, 'Choose a role…');

    fillSelect(document.getElementById('mentorPerson'), people, 'Choose a person…');
    fillSelect(document.getElementById('mentorJob'), jobs, 'Choose a role…');
  } catch (err) {
    console.error('Failed to load dropdown data', err);
  }
}

// ---------- explore graph (vis-network) ----------
let network = null;

function groupColor(group) {
  if (group === 'job') return { background: '#f2a93b', border: '#c9821c' };
  if (group === 'skill') return { background: '#4fc3c0', border: '#2f8f8c' };
  return { background: '#e85d75', border: '#b93c53' }; // course
}

function renderGraph(containerId, emptyId, data) {
  const container = document.getElementById(containerId);
  const empty = document.getElementById(emptyId);

  if (!data.nodes.length) {
    empty.style.display = 'flex';
    container.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  container.style.display = 'block';

  const nodes = new vis.DataSet(
    data.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      shape: n.group === 'job' ? 'box' : n.group === 'course' ? 'diamond' : 'dot',
      size: 16,
      color: groupColor(n.group),
      font: { color: '#edeff2', face: 'Inter', size: 13 },
      borderWidth: 2,
    }))
  );
  const edges = new vis.DataSet(
    data.edges.map((e) => ({
      from: e.from,
      to: e.to,
      label: e.label,
      arrows: 'to',
      color: { color: '#3a4756', highlight: '#6fb7ff' },
      font: { color: '#8b98a5', size: 10, strokeWidth: 0, align: 'top' },
      smooth: { type: 'continuous' },
    }))
  );

  if (network) network.destroy();
  network = new vis.Network(
    container,
    { nodes, edges },
    {
      physics: { stabilization: true, barnesHut: { gravitationalConstant: -4000, springLength: 140 } },
      interaction: { hover: true, dragView: true, zoomView: true },
    }
  );
}

async function refreshExploreGraph() {
  const jobId = document.getElementById('exploreJobSelect').value;
  const skillId = document.getElementById('exploreSkillSelect').value;

  if (!jobId && !skillId) {
    renderGraph('exploreGraph', 'exploreEmpty', { nodes: [], edges: [] });
    return;
  }

  try {
    const data = skillId ? await api(`/skills/${skillId}/graph`) : await api(`/jobs/${jobId}/requirements`);
    renderGraph('exploreGraph', 'exploreEmpty', data);
  } catch (err) {
    document.getElementById('exploreEmpty').textContent = `Couldn't load graph: ${err.message}`;
    document.getElementById('exploreEmpty').style.display = 'flex';
    document.getElementById('exploreGraph').style.display = 'none';
  }
}

document.getElementById('exploreJobSelect').addEventListener('change', (e) => {
  if (e.target.value) document.getElementById('exploreSkillSelect').value = '';
  refreshExploreGraph();
});
document.getElementById('exploreSkillSelect').addEventListener('change', (e) => {
  if (e.target.value) document.getElementById('exploreJobSelect').value = '';
  refreshExploreGraph();
});

// ---------- career path ----------
document.getElementById('pathSubmit').addEventListener('click', async () => {
  const from = document.getElementById('pathFrom').value;
  const to = document.getElementById('pathTo').value;
  const result = document.getElementById('pathResult');

  if (!from || !to) {
    result.innerHTML = '<p class="error-msg">Pick both a starting role and a target role.</p>';
    return;
  }
  result.innerHTML = '<p style="color:var(--text-muted)">Searching…</p>';
  try {
    const data = await api(`/career/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!data.found) {
      result.innerHTML = `<p>${data.message}</p>`;
      return;
    }
    const chain = data.jobs
      .map((j) => `<span class="route-node">${j.name}</span>`)
      .join('<span class="route-arrow">&rarr;</span>');
    result.innerHTML = `<div class="route-chain">${chain}</div><div class="hop-count">${data.hops} step${data.hops === 1 ? '' : 's'} in the progression graph</div>`;
  } catch (err) {
    result.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
});

// ---------- skill gap ----------
document.getElementById('gapSubmit').addEventListener('click', async () => {
  const personId = document.getElementById('gapPerson').value;
  const jobId = document.getElementById('gapJob').value;
  const result = document.getElementById('gapResult');

  if (!personId || !jobId) {
    result.innerHTML = '<p class="error-msg">Pick both a person and a target role.</p>';
    return;
  }
  result.innerHTML = '<p style="color:var(--text-muted)">Analyzing…</p>';
  try {
    const data = await api(`/career/gap?personId=${encodeURIComponent(personId)}&jobId=${encodeURIComponent(jobId)}`);
    const rows = [...data.missing, ...data.have]
      .map((s) => {
        const badge = s.alreadyHave ? '✓' : '!';
        const cls = s.alreadyHave ? 'have' : 'missing';
        const courseText = s.alreadyHave
          ? 'Already have this skill'
          : s.courses.length
          ? `Courses: ${s.courses.join(', ')}`
          : 'No course in the catalog teaches this yet';
        return `
          <div class="skill-row">
            <div class="skill-badge ${cls}">${badge}</div>
            <div class="skill-row-body">
              <div class="skill-name">${s.skill}</div>
              <div class="skill-courses">${courseText}</div>
            </div>
          </div>`;
      })
      .join('');
    result.innerHTML = `
      <div class="gap-summary">
        <div><strong>${data.haveCount}</strong>skills already have</div>
        <div><strong>${data.missingCount}</strong>skills to learn</div>
      </div>
      ${rows}`;
  } catch (err) {
    result.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
});

// ---------- mentors ----------
document.getElementById('mentorSubmit').addEventListener('click', async () => {
  const personId = document.getElementById('mentorPerson').value;
  const targetJobId = document.getElementById('mentorJob').value;
  const result = document.getElementById('mentorResult');

  if (!personId || !targetJobId) {
    result.innerHTML = '<p class="error-msg">Pick both a person and a target role.</p>';
    return;
  }
  result.innerHTML = '<p style="color:var(--text-muted)">Searching…</p>';
  try {
    const data = await api(`/career/mentors?personId=${encodeURIComponent(personId)}&targetJobId=${encodeURIComponent(targetJobId)}`);
    if (!data.length) {
      result.innerHTML = '<p>No one in that role shares a skill with this person yet.</p>';
      return;
    }
    result.innerHTML = data
      .map(
        (m) => `
        <div class="mentor-row">
          <div>
            <div class="mentor-name">${m.name}</div>
            <div class="mentor-skills">Shares: ${m.sharedSkills.join(', ')}</div>
          </div>
          <div class="mentor-score">${m.sharedSkillCount} shared</div>
        </div>`
      )
      .join('');
  } catch (err) {
    result.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
});

// ---------- init ----------
checkHealth();
loadDropdowns();
setInterval(checkHealth, 30000);
