import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchableSelect } from './searchable-select';

describe('SearchableSelect', () => {
  let focusSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus');
  });

  afterEach(() => {
    focusSpy.mockRestore();
  });

  it('does not submit a parent form when opening the dropdown', () => {
    const handleSubmit = vi.fn((event: Event) => event.preventDefault());

    render(
      <form onSubmit={handleSubmit}>
        <SearchableSelect
          value=""
          onChange={() => undefined}
          options={[
            { key: '', label: 'All Borrowers' },
            { key: 'BOR-1001', label: 'John Doe (BOR-1001)' },
          ]}
          placeholder="Search borrowers..."
          label="Borrower"
        />
      </form>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'All Borrowers' }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Type to search...')).toBeInTheDocument();
  });

  it('focuses the search input without scrolling the page', async () => {
    render(
      <SearchableSelect
        value=""
        onChange={() => undefined}
        options={[
          { key: '', label: 'All Borrowers' },
          { key: 'BOR-1001', label: 'John Doe (BOR-1001)' },
        ]}
        placeholder="Search borrowers..."
        label="Borrower"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'All Borrowers' }));

    await waitFor(() => {
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    });
  });
});
