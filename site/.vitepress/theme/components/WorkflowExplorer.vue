<template>
  <div class="mv-flow">
    <div class="mv-seg" role="tablist" aria-label="Workflow">
      <button v-for="id in PRESET_IDS" :key="id" type="button" role="tab" :aria-selected="id === preset" :class="{ on: id === preset }" @click="choose(id)">{{ presets[id].name }}</button>
    </div>
    <p class="mv-flow-best"><b>{{ presets[preset].name }}</b> — {{ presets[preset].bestFor }}</p>
    <ol class="mv-flow-rail">
      <li v-for="(id, index) in stages" :key="id">
        <button type="button" :class="{ on: id === stage, gate: id === 'review' || id === 'security' }" @click="stage = id">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>{{ id }}
        </button>
      </li>
    </ol>
    <Transition name="mv-fade" mode="out-in">
      <div :key="`${preset}-${stage}`" class="mv-flow-detail">
        <div>
          <span class="mv-kicker">{{ stage }}</span>
          <h3>{{ info.title }}</h3>
          <p>{{ info.copy }}</p>
          <div v-if="artifactFor(stage)" class="mv-flow-artifact">
            <span class="mv-label">ARTIFACT</span> <code>{{ artifactFor(stage).file }}</code>
            <small>{{ artifactFor(stage).sections.join(' · ') }}</small>
          </div>
          <div class="mv-flow-human" :class="{ gate: info.gate }">
            <span class="mv-label">{{ info.gate ? '◆ HUMAN GATE' : 'YOU DECIDE' }}</span>
            <span>{{ info.human }}</span>
          </div>
        </div>
        <div class="mv-flow-how">
          <span class="mv-label">RUN IN YOUR AGENT</span>
          <div class="mv-flow-run">
            <div class="mv-flow-skill"><span>skill</span><code>{{ info.skill }}</code></div>
            <div class="mv-flow-agent"><span>Claude Code</span><code>/{{ info.skill }} {{ slug }}</code></div>
            <div class="mv-flow-agent"><span>Codex · Cursor · Gemini · Copilot · Kiro</span><code>Use the {{ info.skill }} skill for {{ slug }}</code></div>
          </div>
          <span class="mv-label">CLI GATE</span>
          <pre class="mv-flow-cmd"><span v-for="line in info.commands" :key="line">$ {{ line }}
</span></pre>
          <small v-if="info.note" class="mv-flow-note">{{ info.note }}</small>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { ARTIFACTS, PRESET_IDS, presets } from '../../../../src/core/presets.js';

const slug = 'add-orders-pagination';
// Each stage: the skill that runs it in the agent, the CLI gate that proves it, and what the human decides.
const STAGES = {
  prd: { skill: 'maverick-prd', title: 'Say what changes — and what does not', copy: 'The maverick-prd skill reads the grounded code, asks one question at a time, and writes goals, user stories, requirements with scenarios and acceptance criteria.', commands: [`maverick validate ${slug} --stage prd`], human: 'Answer the product questions the code cannot answer, then confirm the next stage.', note: 'Start a new task with maverick new "<idea>": it creates the task and opens your agent at this stage.' },
  spec: { skill: 'maverick-spec', title: 'Specify the behavior before the design', copy: 'Spec-driven only. The maverick-spec skill turns every acceptance criterion into numbered WHEN/THEN scenarios, exact contracts, states, invariants and errors, with a traceability table. Code and tests are written against SPEC.md.', commands: [`maverick validate ${slug} --stage spec`, `maverick flow run spec ${slug}`, `maverick flow approve spec ${slug} spec-approval`], human: 'Approve the behavior: check "- [x] Spec approved" in SPEC.md, or run flow approve. No design starts before it.', gate: true },
  techspec: { skill: 'maverick-techspec', title: 'Ground the approach in real files', copy: 'The maverick-techspec skill records the current state with path:line references, the approach and rejected alternatives, the files to change and a Test Plan mapped to every criterion.', commands: [`maverick validate ${slug} --stage techspec`], human: 'Confirm the approach before it is broken into tasks.' },
  tasks: { skill: 'maverick-tasks', title: 'A graph of shippable tasks', copy: 'The maverick-tasks skill splits the spec at dependency, parallel or domain boundaries — usually 3 to 7 tasks, each with its own tests — and covers every acceptance criterion.', commands: [`maverick validate ${slug} --stage tasks`, `maverick subtask list ${slug}`], human: 'Confirm the task graph.' },
  build: { skill: 'maverick-build', title: 'A focused change, one subtask at a time', copy: 'The maverick-build skill takes the next ready subtask, marks it in progress, follows its Files and Steps, writes its tests, runs its Verification, marks it done and asks before the next.', commands: [`maverick subtask next ${slug}`, `maverick verify ${slug}`, `maverick guard ${slug}`], human: 'Say yes before each next subtask.', note: `Headless: maverick agent run ${slug} --subtask next runs a trusted agent within a permission ceiling.` },
  verify: { skill: 'maverick-review', title: 'Collect evidence, not claims', copy: 'Tests, lint, type checks and build output are recorded with exit codes. Guard compares the diff with the TECHSPEC File References and the task Files.', commands: [`maverick verify ${slug}`, `maverick guard ${slug}`, `maverick deps ${slug}`], human: 'Read the evidence. A failing gate sends the work back to build.' },
  security: { skill: 'maverick-review', title: 'An extra gate for risky work', copy: 'Strict tasks need security and dependency signals before review, plus a checkpoint before merge. The maverick-review skill runs this gate for you.', commands: [`maverick security ${slug}`, `maverick deps ${slug}`], human: 'Read every security finding before review.' },
  review: { skill: 'maverick-review', title: 'A human decides', copy: 'The maverick-review skill writes REVIEW.md from the PRD acceptance criteria and the tasks, reviews the diff against each criterion and fills in everything but the decision. Maverick never approves a change on its own.', commands: [`maverick review ${slug} --diff`, `maverick flow run ship ${slug}`], human: 'Check one box in REVIEW.md: approve, approve with follow-up, or request changes.', gate: true },
  pr: { skill: 'maverick-ship', title: 'Record the rationale', copy: 'The maverick-ship skill checks merge readiness and writes PR-DRAFT.md, linking intent, what changed, how it was verified and the review decision. It commits, pushes or opens the PR only when you ask.', commands: [`maverick readiness ${slug}`, `maverick pr ${slug}`], human: 'Open and merge the PR. Maverick never merges.', gate: true }
};
const ARTIFACT_OF = {
  ...Object.fromEntries(ARTIFACTS.map(artifact => [artifact.stage, artifact])),
  tasks: { file: 'subtasks/_tasks.md · task_NN.md', sections: ['Goal', 'Acceptance Criteria', 'Files', 'Steps', 'Verification'] },
  review: { file: 'REVIEW.md', sections: ['Acceptance Criteria', 'Tasks', 'Checks', 'Findings', 'Decision'] }
};

const preset = ref('standard');
const stage = ref('prd');
const stages = computed(() => presets[preset.value].stages);
const info = computed(() => STAGES[stage.value]);
const artifactFor = id => ARTIFACT_OF[id];

function choose(id) {
  preset.value = id;
  if (!stages.value.includes(stage.value)) stage.value = stages.value[0];
}
</script>
