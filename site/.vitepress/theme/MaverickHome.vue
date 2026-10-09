<template>
  <div class="mv-home">
    <section class="mv-hero">
      <div class="mv-hero-grid" aria-hidden="true" />
      <div class="mv-hero-glow" aria-hidden="true" />
      <div class="mv-hero-inner">
        <div class="mv-hero-copy">
          <a class="mv-pill" :href="withBase('/guide/workflow#spec-driven-development-sdd')"><span>NEW</span> Spec-driven workflow — approve the behavior before the design →</a>
          <h1>Context before code.<br /><span class="mv-gradient">Evidence before merge.</span></h1>
          <p class="mv-lead">Your AI agent writes the code. Maverick makes it mergeable. One sentence becomes a PRD, a spec grounded in your code and a graph of tasks; every change leaves evidence and ends with a human decision. The same workflow in Claude Code, Codex, Cursor, Gemini, Copilot, Kiro and more — all local.</p>
          <div class="mv-hero-actions">
            <a class="mv-btn primary" :href="withBase('/guide/getting-started')">Get started <span aria-hidden="true">→</span></a>
            <a class="mv-btn" :href="withBase('/lens/')">Explore Lens</a>
          </div>
          <CopyCommand command='npx @maverick-ai/cli new "Add cursor pagination to the orders endpoint"' />
          <ul class="mv-hero-facts">
            <li><b>0</b> telemetry</li>
            <li><b>9</b> AI agents supported</li>
            <li><b>11+</b> language stacks</li>
          </ul>
        </div>
        <AnimatedTerminal class="mv-hero-term" title="northstar-orders — zsh" :lines="terminal" />
      </div>
    </section>

    <section class="mv-section mv-reveal">
      <div class="mv-section-head">
        <span class="mv-kicker">MAVERICK LENS</span>
        <h2>See your repository the way a reviewer should.</h2>
        <p>One command opens a local workspace: tasks and evidence, entry points, coupling, integrations, team knowledge and ranked findings. Nothing leaves your machine.</p>
      </div>
      <LensShowcase />
      <div class="mv-center"><CopyCommand command="npx @maverick-ai/cli lens --open" /></div>
    </section>

    <section class="mv-section mv-reveal">
      <div class="mv-section-head">
        <span class="mv-kicker">WORKFLOW / CORE</span>
        <h2>One workflow. Any assistant.</h2>
        <p>Pick a workflow and click through the stages to see the artifact each one produces and the command that drives it.</p>
      </div>
      <WorkflowExplorer />
    </section>

    <section class="mv-section mv-reveal">
      <div class="mv-section-head">
        <span class="mv-kicker">CAPABILITIES</span>
        <h2>Everything around the diff.</h2>
      </div>
      <div class="mv-bento">
        <a v-for="card in bento" :key="card.title" class="mv-tile" :class="card.size" :href="withBase(card.link)">
          <span class="mv-tile-icon" aria-hidden="true">{{ card.icon }}</span>
          <h3>{{ card.title }}</h3>
          <p>{{ card.copy }}</p>
          <code v-if="card.cmd">{{ card.cmd }}</code>
          <img v-if="card.shot" :src="withBase(`/screens/${card.shot}.png`)" alt="" loading="lazy" class="mv-tile-shot" />
          <span class="mv-tile-more" aria-hidden="true">→</span>
        </a>
      </div>
    </section>

    <section class="mv-section mv-reveal">
      <div class="mv-section-head">
        <span class="mv-kicker">PICK A WORKFLOW</span>
        <h2>The right amount of process for each change.</h2>
        <p>Three workflows, one pipeline. <code>spec-driven</code> adds an approved behavioral spec before the design, <code>strict</code> adds a security gate, and <code>maverick new</code> picks them on its own for API and integration ideas or for security, data, payment and migration ideas.</p>
      </div>
      <PresetPicker />
    </section>

    <section class="mv-section mv-reveal">
      <div class="mv-section-head">
        <span class="mv-kicker">ADAPTERS</span>
        <h2>Portable across the tools your team already uses.</h2>
        <p>The same artifacts, instructions and capabilities work across assistants. Switch tools without rewriting your workflow.</p>
      </div>
      <div class="mv-logos">
        <a v-for="tool in tools" :key="tool.name" :href="withBase(tool.link)" class="mv-logo"><span>{{ tool.mark }}</span>{{ tool.name }}</a>
      </div>
    </section>

    <section class="mv-cta mv-reveal">
      <div class="mv-hero-glow" aria-hidden="true" />
      <span class="mv-kicker">AI WRITES. ENGINEERS DECIDE.</span>
      <h2>Ship AI-assisted changes you can defend in review.</h2>
      <div class="mv-hero-actions center">
        <a class="mv-btn primary" :href="withBase('/guide/first-task')">Run your first task →</a>
        <a class="mv-btn" :href="withBase('/reference/cli')">Browse the CLI</a>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { withBase } from 'vitepress';
import AnimatedTerminal from './components/AnimatedTerminal.vue';
import CopyCommand from './components/CopyCommand.vue';
import LensShowcase from './components/LensShowcase.vue';
import PresetPicker from './components/PresetPicker.vue';
import WorkflowExplorer from './components/WorkflowExplorer.vue';

const terminal = [
  { kind: 'cmd', text: 'maverick new "Add cursor pagination to the orders endpoint"' },
  { kind: 'ok', text: '✓ task created: add-cursor-pagination-orders-endpoint' },
  { kind: 'muted', text: '  Workflow: Spec Driven · [PRD] → SPEC → TECHSPEC → TASKS' },
  { kind: 'muted', text: '  Grounded in: src/orders/orders.service.ts (+5 more)' },
  { kind: 'accent', text: '▶ opening Claude Code. The rest of the flow happens there.' },
  { kind: 'cmd', text: 'maverick flow run ship add-cursor-pagination-orders-endpoint' },
  { kind: 'ok', text: 'PASS artifacts · checks · scope · security · dependencies' },
  { kind: 'muted', text: 'WAIT human-review' },
  { kind: 'accent', text: 'Outcome: AWAITING-APPROVAL — a human makes the call' }
];
const bento = [
  { size: 'wide', icon: '⌗', title: 'Architecture intelligence', copy: 'Import graph, cycles, hubs and a health score with its formula — across JavaScript, Python, Go, Rust, Java, .NET and more.', cmd: 'maverick graph --format mermaid', shot: 'devtools-overview', link: '/guide/devtools' },
  { size: '', icon: '⇢', title: 'Entry points anywhere', copy: 'Decorators, routers, file-system routing and contracts — with guards and write routes without one.', cmd: 'maverick routes --kind http', link: '/guide/devtools' },
  { size: '', icon: '◉', title: 'Impact before you touch it', copy: 'Transitive dependents, affected entry points and the tests to run.', cmd: 'maverick impact src/services/orders.js', link: '/guide/devtools' },
  { size: '', icon: '⚙', title: 'Headless agents', copy: 'Run Claude Code, Codex, Gemini, Copilot, Kiro and more within trust lists, permission ceilings and a model per step.', cmd: 'maverick agent run my-task', link: '/reference/cli' },
  { size: '', icon: '↻', title: 'Contract-driven flows', copy: 'Typed gates, iteration caps and no-progress windows end in done, revise or awaiting-approval.', cmd: 'maverick flow run ship my-task', link: '/reference/cli' },
  { size: 'full', icon: '✦', title: 'Capabilities, everywhere', copy: 'Install skills, agents, commands and MCP servers across nine AI tools with a lockfile, content hashes and a dry-run plan.', cmd: 'maverick add reviewer maverick-review --dry-run', link: '/reference/cli' }
];
const tools = [
  { name: 'Claude Code', mark: '✳', link: '/integrations/claude-code' },
  { name: 'Codex', mark: '◐', link: '/integrations/codex' },
  { name: 'Cursor', mark: '▲', link: '/integrations/cursor' },
  { name: 'GitHub Copilot', mark: '◎', link: '/integrations/generic' },
  { name: 'Gemini CLI', mark: '✦', link: '/integrations/generic' },
  { name: 'Kiro', mark: '◇', link: '/integrations/generic' },
  { name: 'Antigravity', mark: '△', link: '/integrations/generic' },
  { name: 'OpenCode', mark: '⌘', link: '/integrations/generic' },
  { name: 'Windsurf', mark: '≋', link: '/integrations/generic' }
];

let observer;
onMounted(() => {
  observer = new IntersectionObserver(entries => entries.forEach(entry => entry.isIntersecting && entry.target.classList.add('in')), { threshold: 0.12 });
  document.querySelectorAll('.mv-reveal').forEach(element => observer.observe(element));
});
onBeforeUnmount(() => observer?.disconnect());
</script>
