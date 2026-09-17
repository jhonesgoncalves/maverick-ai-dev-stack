import DefaultTheme from 'vitepress/theme';
import './style.css';
import MaverickHome from './MaverickHome.vue';

export default { ...DefaultTheme, enhanceApp({ app }) { app.component('MaverickHome', MaverickHome); } };
