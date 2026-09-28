import { defineConfig, type Connect, type HtmlTagDescriptor, type Plugin } from 'vite';
import { dirname, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { MARK, NAME, WORKS, type Work } from './door/works.ts';

/** Where the album is published. Canonical links, cards, structured data and the sitemap are made from it. */
const ORIGIN = 'https://daykiln.renocrypt.com';

const page = (path: string) => resolve(__dirname, path, 'index.html');

/**
 * Each work's room is published at its own address (door/works.ts), made from a page of this
 * repository: Yaobian's three from its one page, which routes in the browser; each of Plates' from
 * its study. In development the address is answered with that page; the build gives each room a copy
 * of it with its own head (see site()), and the preview serves those. Without this, Vite's fallback
 * would answer them with the door. The series have no pages of their own: /plates/ and /yaobian/
 * lead to the door.
 */
const ROOMS = new Map(WORKS.map((w) => [w.path, w.page]));
const SERIES_ROUTE = /^\/(plates|yaobian)\/?(index\.html)?(\?.*)?$/;
/** A work's address, if `url` asks for one, with or without its trailing slash. */
const roomOf = (url = '') => {
  const path = url.replace(/[?#].*$/, '').replace(/\/?$/, '/');
  return ROOMS.has(path) ? path : null;
};
function rooms(): Plugin {
  const to = (copies: boolean): Connect.NextHandleFunction => (req, res, next) => {
    if (SERIES_ROUTE.test(req.url ?? '')) {
      res.statusCode = 302;
      res.setHeader('Location', '/');
      res.end();
      return;
    }
    const room = roomOf(req.url);
    if (room) req.url = copies ? `${room}index.html` : `/${ROOMS.get(room)}/index.html`;
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

type Head = { title: string; description?: string; image?: string; imageAlt?: string; data?: object; work?: Work };

/** Each page's head, by its route; a page not named here is a study, kept out of the index. */
const HEADS = new Map<string, Head>([
  ['/', { title: TITLE, data: album }],
  ...WORKS.map((w): [string, Head] => [w.path, {
    title: `${w.name} · ${w.series} ${w.numeral} · ${SIGN}`,
    description: `${w.description} One of six works in ${SIGN}.`,
    image: `${ORIGIN}/door/cards/${w.id}.jpg`,
    imageAlt: `${w.name}, ${w.series} ${w.numeral}: ${w.credit[0].toUpperCase()}${w.credit.slice(1)}.`,
    data: { '@context': 'https://schema.org', ...creativeWork(w), isPartOf: { '@id': seriesId(w.series) } },
    work: w,
  }]),
]);

/** A page's route: the work's address it was asked for as, or its folder. */
function routeOf(path: string, asked?: string): string {
  return roomOf(asked) ?? path.replace(/\?.*$/, '').replace(/index\.html$/, '');
}

/**
 * What a work's room says in its HTML, for crawlers and screen readers: its name, what it comes
 * from, and the way to the album. The rooms set no title in the experience, so it is kept out of
 * sight, as text for assistive technology is.
 */
const roomText = (w: Work) => `<header style="position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0">
<h1>${escape(w.name)} · ${escape(w.series)} ${escape(w.numeral)}</h1>
<p>${escape(w.description)} One of six works in <a href="/"><span lang="zh-Hant">${MARK}</span> ${NAME}</a>.</p>
</header>`;

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
  if (head.work) html = html.replace(/<body([^>]*)>/, (b) => `${b}\n${roomText(head.work!)}`);
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
      ...(head.imageAlt ? [meta('property', 'og:image:alt', head.imageAlt), meta('name', 'twitter:image:alt', head.imageAlt)] : []),
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
/** The day the site was built: each build is a publication, so each page's last change is no later. */
const BUILT = new Date().toISOString().slice(0, 10);

/** A page that only leads on: what /plates/ and /yaobian/ serve (the door), and the rooms' old addresses. */
const LEAD = (to: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${TITLE}</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${ORIGIN}${to}">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace('${to}' + location.search + location.hash)</script>
</head>
</html>
`;
const TO_DOOR = LEAD('/');

/** What GitHub Pages answers for an address that is not there: the album's name, and the way to it. */
const MISSING = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/door/icon-32.png" sizes="32x32" type="image/png">
<style>
  html { background: #e9e3d6; color: #221b14; }
  @media (prefers-color-scheme: dark) { html { background: #181614; color: #d9d1c2; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 400 15px/1.5 ui-serif, Georgia, serif; }
  a { color: inherit; text-decoration: none; letter-spacing: 0.08em; }
  a span { font-size: 22px; margin-right: 0.4em; }
</style>
</head>
<body>
<a href="/"><span lang="zh-Hant">${MARK}</span>${NAME}</a>
</body>
</html>
`;
const TEXTS: Record<string, { type: string; body: () => string }> = {
  'robots.txt': { type: 'text/plain', body: () => `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n` },
  'sitemap.xml': {
    type: 'application/xml',
    body: () => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
      urls.map((u) => `  <url><loc>${ORIGIN}${u}</loc><lastmod>${BUILT}</lastmod></url>`).join('\n')}\n</urlset>\n`,
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
  const built = new Map<string, string>(); // the rooms' pages as built, before they were given heads: the rooms are copies of them
  const pages = new Set(WORKS.map((w) => `/${w.page}/index.html`));
  return {
    name: 'daykiln-site',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (pages.has(ctx.path) && !ctx.server) built.set(ctx.path, html);
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
      for (const w of WORKS) {
        const { html, tags } = headed(built.get(`/${w.page}/index.html`) ?? '', w.path);
        this.emitFile({ type: 'asset', fileName: `${w.path.slice(1)}index.html`, source: render(html, tags) });
      }
      // The rooms' copies made, Yaobian's own page and Plates' address lead to the door, and a
      // Plates room's study, where the room was first published, leads to the room.
      for (const [page, to] of [['yaobian', '/'], ...WORKS.filter((w) => w.page !== 'yaobian').map((w) => [w.page, w.path])]) {
        const asset = bundle[`${page}/index.html`];
        if (asset?.type === 'asset') asset.source = LEAD(to);
      }
      this.emitFile({ type: 'asset', fileName: 'plates/index.html', source: TO_DOOR });
      this.emitFile({ type: 'asset', fileName: '404.html', source: MISSING });
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
