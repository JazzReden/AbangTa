import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSiteInfo } from '@/lib/site-info';
import { SiteFooter } from '@/components/SiteFooter';

jest.mock('@/components/SiteFooter.module.css', () => ({}));

test('footer never invents official contact information or social destinations', () => {
  const info = getSiteInfo({});
  expect(info.email).toBeNull();
  expect(info.phone).toBeNull();
  expect(info.socialLinks.every(link => link.href === null)).toBe(true);
  const html = renderToStaticMarkup(React.createElement(SiteFooter));
  for (const label of ['About AbangTa', 'Contact us', 'Follow us', 'Facebook', 'TikTok', 'Instagram']) expect(html).toContain(label);
  expect(html).not.toContain('href="#"');
});

test('official social links must use HTTPS and the correct platform hostname', () => {
  const valid = getSiteInfo({ ABANGTA_CONTACT_EMAIL: 'support@example.test', ABANGTA_CONTACT_PHONE: '+63 917 123 4567', ABANGTA_FACEBOOK_URL: 'https://www.facebook.com/abangta', ABANGTA_TIKTOK_URL: 'https://www.tiktok.com/@abangta', ABANGTA_INSTAGRAM_URL: 'https://www.instagram.com/abangta/' });
  expect(valid.email).toBe('support@example.test');
  expect(valid.phoneHref).toBe('tel:+639171234567');
  expect(valid.socialLinks.every(link => Boolean(link.href))).toBe(true);
  for (const value of ['javascript:alert(1)', 'http://facebook.com/abangta', 'https://facebook.com.evil.test/abangta', 'https://facebook.com@evil.test/abangta', 'https://www.facebook.com/']) {
    expect(getSiteInfo({ ABANGTA_FACEBOOK_URL: value }).socialLinks[0].href).toBeNull();
  }
  expect(getSiteInfo({ ABANGTA_CONTACT_EMAIL: 'bad\r\nemail', ABANGTA_CONTACT_PHONE: '----' }).email).toBeNull();
});
