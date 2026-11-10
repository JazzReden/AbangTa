import { z } from 'zod';

const platforms = [
  { name: 'Facebook', key: 'ABANGTA_FACEBOOK_URL', hosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com'] },
  { name: 'TikTok', key: 'ABANGTA_TIKTOK_URL', hosts: ['tiktok.com', 'www.tiktok.com'] },
  { name: 'Instagram', key: 'ABANGTA_INSTAGRAM_URL', hosts: ['instagram.com', 'www.instagram.com'] },
];

export function getSiteInfo(env: Record<string, string | undefined> = process.env) {
  const email = z.string().trim().email().max(254).safeParse(env.ABANGTA_CONTACT_EMAIL);
  const rawPhone = env.ABANGTA_CONTACT_PHONE?.trim() ?? '';
  const digits = rawPhone.replace(/\D/g, '');
  const phone = /^\+?[\d\s()-]+$/.test(rawPhone) && digits.length >= 7 && digits.length <= 15 ? rawPhone : null;
  return {
    email: email.success ? email.data : null,
    phone,
    phoneHref: phone ? 'tel:' + (phone.startsWith('+') ? '+' : '') + digits : null,
    socialLinks: platforms.map(platform => {
      let href: string | null = null;
      try {
        const url = new URL(env[platform.key] ?? '');
        if (url.protocol === 'https:' && platform.hosts.includes(url.hostname) && !url.username && !url.password && !url.port && url.pathname !== '/') href = url.href;
      } catch { /* An unconfigured or invalid link stays inactive. */ }
      return { name: platform.name, href };
    }),
  };
}
