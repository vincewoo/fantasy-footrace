import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EspnError } from '../espn/client';
import { ConnectError } from './Connect';

describe('ConnectError', () => {
  it('asks for the league passphrase when the proxy rejects the key', () => {
    const markup = renderToStaticMarkup(
      <ConnectError error={new EspnError('x', 403, 'key')} onRetry={() => {}} onDemo={() => {}} />,
    );

    expect(markup).toContain('league passphrase');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('Unlock');
  });
});
