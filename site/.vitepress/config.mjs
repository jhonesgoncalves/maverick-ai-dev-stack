import { defineConfig } from 'vitepress';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.DOCS_BASE || (repository ? `/${repository}/` : '/');
const github = 'https://github.com/jhonesgoncalves/maverick-ai-dev-stack';
const items = (prefix, names) => names.map(([link, text]) => ({ text, link: `${prefix}/${link}` }));

export default defineConfig({
  title: 'Maverick AI',
  description: 'An open-source engineering workflow for building with AI using explicit context, scope, verification and human review.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  appearance: 'force-dark',
  head: [
    ['link', { rel: 'icon', href: `${base}brand/maverick-ai-mark.svg`, type: 'image/svg+xml' }],
    ['link', { rel: 'icon', href: `${base}favicon.ico`, sizes: '32x32' }],
    ['link', { rel: 'apple-touch-icon', href: `${base}brand/app-icon-192.png` }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap' }],
    ['meta', { name: 'theme-color', content: '#070707' }],
    ['meta', { property: 'og:title', content: 'Maverick AI' }],
    ['meta', { property: 'og:description', content: 'AI-powered developer workspace. Understand. Build. Debug. Ship.' }],
    ['meta', { property: 'og:image', content: `${base}screens/lens-inbox.png` }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }]
  ],
  markdown: { theme: 'github-dark-default' },
  themeConfig: {
    logo: { src: '/brand/maverick-ai-logo-dark-tight.svg', alt: 'Maverick AI' },
    siteTitle: false,
    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'On this page' },
    socialLinks: [{ icon: 'github', link: github }],
    editLink: { pattern: `${github}/edit/main/site/:path`, text: 'Edit this page on GitHub' },
    footer: { message: 'AI writes. Engineers decide. · Code under MIT · content under CC BY-NC 4.0.', copyright: 'Maverick AI — local-first, no telemetry.' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/(getting-started|installation|first-task|method|planning|workflow)' },
      { text: 'Lens', link: '/lens/', activeMatch: '^/lens/' },
      { text: 'CLI', link: '/reference/cli', activeMatch: '/reference/' },
      { text: 'Concepts', link: '/concepts/', activeMatch: '/concepts/' },
      { text: 'Adapters', link: '/integrations/claude-code', activeMatch: '/integrations/' },
      { text: 'Lab', link: '/lab/introduction', activeMatch: '/lab/' }
    ],
    sidebar: {
      '/lens/': [
        { text: 'Getting started', items: [{ text: 'Introduction', link: '/lens/' }, ...items('/lens', [['quick-start', 'Quick start'], ['interface', 'The interface']])] },
        { text: 'Workspace', items: items('/lens', [['inbox-and-tasks', 'Inbox and tasks'], ['task-page', 'The task page'], ['agents', 'Agents'], ['runs', 'Runs'], ['loops', 'Loops']]) },
        { text: 'Codebase', items: items('/lens', [['devtools', 'Devtools'], ['library', 'Library and changes']]) },
        { text: 'System', items: items('/lens', [['system', 'Capabilities and settings']]) },
        { text: 'Reference', items: items('/lens', [['cli', 'maverick lens'], ['configuration', 'Configuration'], ['api', 'HTTP API'], ['security', 'Security model'], ['troubleshooting', 'Troubleshooting']]) },
        { text: 'More', collapsed: true, items: [{ text: 'Maverick guide', link: '/guide/getting-started' }, { text: 'CLI reference', link: '/reference/cli' }, { text: 'Announcement', link: '/announcements/maverick-lens' }] }
      ],
      '/': [
        { text: 'Get started', items: [{ text: 'Introduction', link: '/guide/getting-started' }, { text: 'Installation', link: '/guide/installation' }, { text: 'Your first task', link: '/guide/first-task' }, { text: 'The Maverick Method', link: '/guide/method' }, { text: 'From idea to tasks', link: '/guide/planning' }, { text: 'The workflow', link: '/guide/workflow' }, { text: 'FAQ', link: '/faq' }] },
        { text: 'Maverick Lens', items: [{ text: 'Lens documentation', link: '/lens/' }, { text: 'Devtools', link: '/lens/devtools' }, { text: 'Announcement', link: '/announcements/maverick-lens' }] },
        { text: 'Concepts', collapsed: false, items: [{ text: 'Overview', link: '/concepts/' }, ...items('/concepts', [['context-engineering', 'Context engineering'], ['brief', 'Task brief'], ['planning', 'Planning'], ['verification', 'Verification'], ['review', 'Review'], ['human-in-the-loop', 'Human in the loop'], ['loop-engineering', 'Loop engineering']])] },
        { text: 'Reference', items: [{ text: 'CLI', link: '/reference/cli' }, { text: 'Configuration', link: '/reference/config' }, ...items('/reference', [['artifacts', 'Task artifacts'], ['prompts', 'Prompts'], ['agents', 'Agents'], ['workflows', 'Workflows']])] },
        { text: 'Adapters', collapsed: true, items: items('/integrations', [['claude-code', 'Claude Code'], ['codex', 'Codex'], ['cursor', 'Cursor'], ['generic', 'Generic agents']]) },
        { text: 'Maverick Lab', collapsed: true, items: items('/lab', [['introduction', 'Introduction'], ['experiment-design', 'Experiment design'], ['measurement', 'Measurement']]) },
        { text: 'Project', collapsed: true, items: [{ text: 'Contributing', link: '/contributing' }, { text: 'Security', link: '/security' }] }
      ]
    }
  }
});
