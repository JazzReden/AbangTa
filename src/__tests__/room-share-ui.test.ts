import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomShare } from '@/components/landlord/RoomShare';

test('room sharing displays polished controls instead of the raw host, room ID and token', () => {
  const url = 'http://localhost:3000/join?room=internal-room-id&token=' + 'a'.repeat(64);
  const html = renderToStaticMarkup(React.createElement(RoomShare, {
    url, qr: 'data:image/png;base64,test', propertyName: 'Geo Dorm', roomNumber: '101',
  }));
  expect(html).not.toContain('localhost');
  expect(html).not.toContain('internal-room-id');
  expect(html).not.toContain('token=');
  expect(html).toContain('Copy link');
  expect(html).toContain('Share invitation for Room 101');
  expect(html).toContain('QR code');
  expect(html).toContain('Recipient email');
});
