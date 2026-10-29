import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../src/app/App';

describe('opening screen', () => {
  it('explains the development route and offers a repository entry', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /开发路线/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/GitHub 仓库/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /连接仓库/ })).toBeInTheDocument();
  });
});
