import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JoinRequestActions } from '@/components/landlord/JoinRequestActions';

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  useFormStatus: jest.fn(() => ({ pending: false })),
}));
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useActionState: jest.fn((_action, state) => [state, undefined, false]),
}));
beforeEach(() => jest.clearAllMocks());

test('approve and decline have matching dimensions in the same responsive row', () => {
  const action = jest.fn().mockResolvedValue({ success: 'Reviewed' });
  const html = renderToStaticMarkup(React.createElement(JoinRequestActions, { approve: action, decline: action }));
  expect(html).toContain('grid grid-cols-2 gap-3');
  expect(html.match(/h-11 items-center justify-center/g)).toHaveLength(2);
  expect(html).toContain('name="confirm"');
  expect(html).toMatch(/value="decline" formnovalidate=""/i);
  expect(html).toContain('value="approve"');
  expect(action).not.toHaveBeenCalled();
});

test('declining does not require the approval checkbox; approving does', async () => {
  const approve = jest.fn().mockResolvedValue({ success: 'Approved' });
  const decline = jest.fn().mockResolvedValue({ success: 'Declined' });
  renderToStaticMarkup(React.createElement(JoinRequestActions, { approve, decline }));
  const dispatch = require('react').useActionState.mock.calls[0][0];
  const form = new FormData();
  form.set('decision', 'decline');
  await dispatch({}, form);
  expect(decline).toHaveBeenCalledTimes(1);
  form.set('decision', 'approve');
  expect(await dispatch({}, form)).toHaveProperty('error');
  expect(approve).not.toHaveBeenCalled();
  form.set('confirm', 'on');
  await dispatch({}, form);
  expect(approve).toHaveBeenCalledTimes(1);
});
