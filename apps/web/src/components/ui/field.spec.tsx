import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldError } from './field';

// aped-review F11 — FieldError used to read only `error.message`, so a plain-string error
// (what a TanStack Form validator returns) was silently dropped and nothing rendered. This is
// what defeated AC-5's onboarding break error surfacing in the live UI despite the validator
// running. Guard both shapes.
describe('FieldError — renders string and object errors (aped-review F11)', () => {
  it('renders a plain-string error (TanStack Form validator return)', () => {
    render(
      <FieldError
        errors={["Un poste de plus de 6h travaillées nécessite une pause d'au moins 20 minutes."]}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('nécessite une pause');
  });

  it('renders a { message } object error', () => {
    render(<FieldError errors={[{ message: 'Champ requis' }]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Champ requis');
  });

  it('renders nothing when there are no errors', () => {
    const { container } = render(<FieldError errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dedupes and lists multiple distinct string errors', () => {
    render(<FieldError errors={['Erreur A', 'Erreur A', 'Erreur B']} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
