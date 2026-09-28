import { defineConfig, type Connect, type HtmlTagDescriptor, type Plugin } from 'vite';
import { dirname, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { MARK, NAME, WORKS, type Work } from './door/works.ts';

/** Where the album is published. Canonical links, cards, structured data and the sitemap are made from it. */
const ORIGIN = 'https://daykiln.renocrypt.com';

const page = (path: string) => resolve(__dirname, path, 'index.html');

/**
 * Yaobian is a single page with its own routes: /yaobian/kiln, /yaobian/rule and /yaobian/plumb.
 * In development they are all its index.html; the build gives each a copy of it with its own head
 * (see site()), and the preview serves those. Without this, Vite's fallback would answer them with
 * the door. The series have no pages of their own: /plates/ and /yaobian/ lead to the door.
 */
const ROOM_ROUTE = /^\/yaobian\/(kiln|rule|plumb)\/?(\?.*)?$/;
const SERIES_ROUTE = /^\/(plates|yaobian)\/?(index\.html)?(\?.*)?$/;
function rooms(): Plugin {
  const to = (copies: boolean): Connect.NextHandleFunction => (req, res, next) => {
    if (SERIES_ROUTE.test(req.url ?? '')) {
      res.statusCode = 302;
      res.setHeader('Location', '/');
      res.end();
      return;
    }
    const room = req.url?.match(ROOM_ROUTE)?.[1];
    if (room) req.url = copies ? `/yaobian/${room}/index.html` : '/yaobian/index.html';
    next();
  };
  return {
    name: 'daykiln-rooms',
    configureServer: (server) => { server.middlewares.use(to(false)); },
    configurePreviewServer: (server) => { server.middlewares.use(to(true)); },
  };
}

// ---------------------------------------------------------------------------------------------
// What search engines, cards and language models read. Every page is given its head here, from
// door/works.ts; the rooms' own files are left as they are.

const TITLE = `${MARK} · ${NAME}`; // the door's title; the pages under it end with the name as it is set, 照 Daykiln
const SIGN = `${MARK} ${NAME}`;
const CARD = `${ORIGIN}/door/card.jpg`;
const SERIES = { Plates: 'Plates', Yaobian: 'Yaobian 窯變' } as const;
/** The series in the album's order. */
const ORDER = [...new Set(WORKS.map((w) => w.series))];
/** A series and its works' names: `Plates: UNFOLD, WAKE, SAME SKY`. */
const named = (s: Work['series']) => `${SERIES[s]}: ${WORKS.filter((w) => w.series === s).map((w) => w.name).join(', ')}`;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const meta = (key: 'name' | 'property', k: string, content: string): HtmlTagDescriptor =>
  ({ tag: 'meta', attrs: { [key]: k, content }, injectTo: 'head' });
const ld = (data: object): HtmlTagDescriptor =>
  ({ tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(data).replace(/</g, '\\u003c'), injectTo: 'head' });

/** A work as structured data: its room, its place in the album, and what it comes from. */
const creativeWork = (w: Work) => ({
  '@type': 'CreativeWork',
  '@id': `${ORIGIN}${w.path}#work`,
  name: w.name,
  alternateName: `${w.series} ${w.numeral}`,
  url: `${ORIGIN}${w.path}`,
  image: `${ORIGIN}/door/cards/${w.id}.jpg`,
  isBasedOn: {
    '@type': 'CreativeWork',
    name: w.source.name,
    ...(w.source.by && { creator: { '@type': 'Person', name: w.source.by } }),
    ...(w.source.date && { dateCreated: w.source.date }),
    ...(w.source.place && { locationCreated: { '@type': 'Place', name: w.source.place } }),
  },
});

/** A series as structured data: its three works. It has no page of its own; the door holds it. */
const seriesId = (s: Work['series']) => `${ORIGIN}/#${s.toLowerCase()}`;
const series = (s: Work['series']) => ({
  '@type': 'CreativeWorkSeries', '@id': seriesId(s), name: SERIES[s],
  hasPart: WORKS.filter((w) => w.series === s).map(creativeWork),
});

const album = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${ORIGIN}/#site`, url: `${ORIGIN}/`, name: NAME, alternateName: MARK, inLanguage: 'en' },
    {
      '@type': 'CollectionPage', '@id': `${ORIGIN}/#album`, url: `${ORIGIN}/`, name: TITLE,
      description: `Six works in two series. ${ORDER.map(named).join('. ')}.`,
      isPartOf: { '@id': `${ORIGIN}/#site` }, image: CARD,
      hasPart: ORDER.map(series),
    },
  ],
};

type Head = { title: string; description?: string; image?: string; data?: object };

/** Each page's head, by its route; a page not named here is a study, kept out of the index. */
const HEADS = new Map<string, Head>([
  ['/', { title: TITLE, data: album }],
  ...WORKS.map((w): [string, Head] => [w.path, {
    title: `${w.name} · ${w.series} ${w.numeral} · ${SIGN}`,
    description: `${w.description} One of six works in ${SIGN}.`,
    image: `${ORIGIN}/door/cards/${w.id}.jpg`,
    data: { '@context': 'https://schema.org', ...creativeWork(w), isPartOf: { '@id': seriesId(w.series) } },
  }]),
]);

/** A page's route: its folder, or the Yaobian room it was asked for as. */
function routeOf(path: string, asked?: string): string {
  const room = asked?.match(ROOM_ROUTE)?.[1];
  return room ? `/yaobian/${room}/` : path.replace(/\?.*$/, '').replace(/index\.html$/, '');
}

/** Give a page its head. The door's own is in index.html; it is only given its structured data. */
function headed(html: string, route: string): { html: string; tags: HtmlTagDescriptor[] } {
  const head = HEADS.get(route);
  const icon: HtmlTagDescriptor[] = /rel="icon"/.test(html) ? [] : [
    ...[32, 16, 96].map((px): HtmlTagDescriptor => ({ tag: 'link', attrs: { rel: 'icon', href: `/door/icon-${px}.png`, sizes: `${px}x${px}`, type: 'image/png' }, injectTo: 'head' })),
    { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/door/icon-180.png' }, injectTo: 'head' },
  ];
  if (!head) return { html, tags: [...icon, meta('name', 'robots', 'noindex')] };
  if (route === '/') return { html, tags: head.data ? [ld(head.data)] : [] };

  const own = html.match(/<meta name="description" content="([^"]*)">/)?.[1];
  const description = head.description ?? own ?? '';
  const url = `${ORIGIN}${route}`;
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(head.title)}</title>`)
    .replace(/<meta name="description"[^>]*>\s*/, '');
  return {
    html,
    tags: [
      ...icon,
      meta('name', 'description', description),
      { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
      meta('property', 'og:site_name', NAME),
      meta('property', 'og:type', 'website'),
      meta('property', 'og:url', url),
      meta('property', 'og:title', head.title),
      meta('property', 'og:description', description),
      meta('property', 'og:image', head.image ?? CARD),
      meta('property', 'og:image:width', '1200'),
      meta('property', 'og:image:height', '630'),
      meta('name', 'twitter:card', 'summary_large_image'),
      ...(head.data ? [ld(head.data)] : []),
    ],
  };
}

/** Render a head's tags into the page, as Vite does, for the copies made after it has finished. */
const render = (html: string, tags: HtmlTagDescriptor[]) => html.replace('</head>', `${tags.map((t) => {
  const attrs = Object.entries(t.attrs ?? {}).map(([k, v]) => ` ${k}="${escape(String(v))}"`).join('');
  return t.tag === 'script' ? `<script${attrs}>${t.children}</script>` : `<${t.tag}${attrs}>`;
}).join('\n')}\n</head>`);

const urls = ['/', ...WORKS.map((w) => w.path)];

/** What /plates/ and /yaobian/ serve, now the series have no pages: the way to the door. */
const TO_DOOR = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${TITLE}</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${ORIGIN}/">
<meta http-equiv="refresh" content="0; url=/">
<script>location.replace('/')</script>
</head>
</html>
`;
const TEXTS: Record<string, { type: string; body: () => string }> = {
  'robots.txt': { type: 'text/plain', body: () => `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n` },
  'sitemap.xml': {
    type: 'application/xml',
    body: () => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
      urls.map((u) => `  <url><loc>${ORIGIN}${u}</loc></url>`).join('\n')}\n</urlset>\n`,
  },
  'llms.txt': {
    type: 'text/plain; charset=utf-8',
    body: () => [
      `# ${SIGN}`,
      '',
      `> Six works in two series, ${ORDER.map((s) => SERIES[s]).join(' and ')}, in one album: ${ORIGIN}/`,
      ...ORDER.flatMap((series) => [
        '',
        `## ${SERIES[series]}`,
        '',
        ...WORKS.filter((w) => w.series === series).map((w) => `- [${w.name}, ${w.series} ${w.numeral}](${ORIGIN}${w.path}): ${w.credit[0].toUpperCase()}${w.credit.slice(1)}.`),
      ]),
      '',
    ].join('\n'),
  },
};

function site(): Plugin {
  let yaobian = ''; // the built Yaobian page before it was given a head: the rooms' copies are made from it
  return {
    name: 'daykiln-site',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.path === '/yaobian/index.html' && !ctx.server) yaobian = html;
        return headed(html, routeOf(ctx.path, ctx.originalUrl));
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const text = TEXTS[(req.url ?? '').replace(/^\//, '')];
        if (!text) return next();
        res.setHeader('Content-Type', text.type);
        res.end(text.body());
      });
    },
    generateBundle(_options, bundle) {
      for (const w of WORKS.filter((w) => w.series === 'Yaobian')) {
        const { html, tags } = headed(yaobian, w.path);
        this.emitFile({ type: 'asset', fileName: `${w.path.slice(1)}index.html`, source: render(html, tags) });
      }
      // The rooms' copies made, Yaobian's own page and Plates' address lead to the door.
      const template = bundle['yaobian/index.html'];
      if (template?.type === 'asset') template.source = TO_DOOR;
      this.emitFile({ type: 'asset', fileName: 'plates/index.html', source: TO_DOOR });
      for (const [fileName, text] of Object.entries(TEXTS)) this.emitFile({ type: 'asset', fileName, source: text.body() });
    },
  };
}

/**
 * Dev-only endpoint for lab captures: POST /__studies/<name> writes the request body outside the
 * repository, to the system's temporary folder, daykiln/renders/.
 */
const RENDERS = resolve(process.env.TMPDIR ?? tmpdir(), 'daykiln', 'renders');
function studies(): Plugin {
  return {
    name: 'daykiln-studies',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__studies/', (req, res) => {
        const name = decodeURIComponent((req.url ?? '').replace(/^\//, '')).replace(/^scratch\//, '');
        if (req.method !== 'POST' || !/^[a-z0-9][a-z0-9-]*\.(png|json)$/.test(name)) {
          res.statusCode = 400;
          res.end('bad capture name');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', async () => {
          const file = resolve(RENDERS, name);
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, Buffer.concat(chunks));
          res.end(file);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [rooms(), studies(), site()],
  // Also filled into the HTML, as %ORIGIN%.
  define: {
    'import.meta.env.ORIGIN': JSON.stringify(ORIGIN),
  },
  // Where file events do not reach the server (a sandbox without FSEvents), DAYKILN_POLL=1 watches by polling.
  server: { port: 5196, strictPort: true, host: '127.0.0.1', watch: process.env.DAYKILN_POLL ? { usePolling: true, interval: 250 } : undefined },
  preview: { port: 5197, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1000, // three.js alone is about 700 kB; the default warns on every build
    rollupOptions: {
      input: {
        door: page('.'),

        platesLab: page('plates/lab'),
        sameSkyPerception: page('plates/lab/same-sky-perception'),
        unfoldLookdev: page('plates/lab/unfold-lookdev'),
        unfoldPull: page('plates/lab/unfold-pull'),
        wakeStill: page('plates/lab/wake-still'),
        sameSkyRoom: page('plates/lab/same-sky-room'),

        yaobian: page('yaobian'),
        yaobianLab: page('yaobian/lab'),
        kilnLookdev: page('yaobian/lab/kiln-lookdev'),
        ruleLookdev: page('yaobian/lab/rule-lookdev'),
      },
    },
  },
});
