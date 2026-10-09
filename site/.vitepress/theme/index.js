import DefaultTheme from 'vitepress/theme';
import { nextTick, onMounted, watch } from 'vue';
import { useRoute } from 'vitepress';
import mediumZoom from 'medium-zoom';
import './style.css';
import MaverickHome from './MaverickHome.vue';
import AnimatedTerminal from './components/AnimatedTerminal.vue';
import CommandExplorer from './components/CommandExplorer.vue';
import CopyCommand from './components/CopyCommand.vue';
import LensShot from './components/LensShot.vue';
import LensShowcase from './components/LensShowcase.vue';
import PresetPicker from './components/PresetPicker.vue';
import WorkflowExplorer from './components/WorkflowExplorer.vue';
import BriefBuilder from './components/BriefBuilder.vue';
import ConceptMap from './components/ConceptMap.vue';
import GateSimulator from './components/GateSimulator.vue';
import GroundingDemo from './components/GroundingDemo.vue';
import PermissionResolver from './components/PermissionResolver.vue';
import ReviewBoard from './components/ReviewBoard.vue';
import TraceGraph from './components/TraceGraph.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    for (const [name, component] of Object.entries({ MaverickHome, AnimatedTerminal, CommandExplorer, CopyCommand, LensShot, LensShowcase, PresetPicker, WorkflowExplorer, BriefBuilder, ConceptMap, GateSimulator, GroundingDemo, PermissionResolver, ReviewBoard, TraceGraph })) app.component(name, component);
  },
  setup() {
    // Screenshots marked data-zoomable open full size on click.
    const route = useRoute();
    let zoom;
    const attach = () => nextTick(() => { zoom?.detach(); zoom = mediumZoom('.vp-doc [data-zoomable]', { margin: 24, background: 'rgba(5, 5, 5, .92)' }); });
    onMounted(attach);
    watch(() => route.path, attach);
  }
};
