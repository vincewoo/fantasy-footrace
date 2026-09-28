import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EspnError } from '../espn/client';
import { ConnectError, HeaderControls } from './Connect';

describe('ConnectError', () => {
  it('asks for the league passphrase when the proxy rejects the key', () => {
    const markup = renderToStaticMarkup(
      <ConnectError error={new EspnError('x', 403, 'key')} onRetry={() => {}} />,
    );

    expect(markup).toContain('league passphrase');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('Unlock');
  });

  it('shows the real error message instead of a status of zero', () => {
    const markup = renderToStaticMarkup(
      <ConnectError error={new TypeError('boom')} onRetry={() => {}} />,
    );

    expect(markup.replace(/&#x27;/g, "'")).toContain("Couldn't read the league data: boom");
    expect(markup).not.toContain('(0)');
  });
});

describe('HeaderControls', () => {
  it('lists every week so far, newest first, with the current one live', () => {
    const markup = renderToStaticMarkup(
      <HeaderControls week={4} currentWeek={4} onWeek={() => {}} onChangeTeam={() => {}} />,
    );

    const options = [...markup.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(m => m[1]);
    expect(options).toEqual(['WEEK 4 · LIVE', 'WEEK 3 · REPLAY', 'WEEK 2 · REPLAY', 'WEEK 1 · REPLAY']);
    expect(markup).toContain('CHANGE TEAM');
  });
});
