import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EspnError } from '../espn/client';
import { ConnectError } from './Connect';

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
