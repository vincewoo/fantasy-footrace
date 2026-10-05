import { writeFileSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { mockSlate } from './sim/mock';
import { BenchSitter } from './ui/Avatar';
const s = mockSlate('Half PPR');
const row = (waving: boolean[]) => '<div style="display:flex;padding:20px;background:rgba(74,130,240,.3)">' + s.lanes.slice(0, 5).map((l, k) => renderToStaticMarkup(<BenchSitter player={l.me} colors={s.teamColors[l.me.team]} side="me" seat={k} pts={k * 3.2} waving={waving[k]} />)).join('') + '</div>';
const css = readFileSync('src/styles/global.css', 'utf8');
writeFileSync(process.argv[2], `<html><head><style>${css}</style></head><body style="background:#4f8a3a">${row([false, true, false, true, true])}</body></html>`);
