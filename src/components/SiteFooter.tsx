import React from 'react';
import Link from 'next/link';
import { Building2, Facebook, Instagram, Mail, ArrowUpRight } from 'lucide-react';
import { getSiteInfo } from '@/lib/site-info';
import styles from './SiteFooter.module.css';

function SocialIcon({ name }: { name: string }) {
  if (name === 'Facebook') return <Facebook size={21} strokeWidth={1.7} aria-hidden="true" />;
  if (name === 'Instagram') return <Instagram size={21} strokeWidth={1.7} aria-hidden="true" />;
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3h3c0 3 2 5 5 5v3a9 9 0 0 1-5-1.6V16a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3Z" /></svg>;
}

export function SiteFooter() {
  const info = getSiteInfo();
  const year = new Date().toLocaleDateString('en', { year: 'numeric', timeZone: 'Asia/Manila' });
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.columns}>
          <section className={styles.about} aria-labelledby="footer-about">
            <h2 id="footer-about" className={styles.srOnly}>About AbangTa</h2>
            <Link href="/" className={styles.brand} aria-label="AbangTa home"><span className={styles.logo}><Building2 size={25} strokeWidth={1.7} aria-hidden="true" /></span>AbangTa<span className={styles.dot}>.</span></Link>
            <p>Less paperwork.<br />More room for living.</p>
            <p className={styles.description}>Your boarding house, all in one place.</p>
          </section>

          <nav className={styles.explore} aria-label="Footer navigation">
            <h2>Explore</h2>
            <ul>
              <li><Link href="/#features">Features</Link></li>
              <li><Link href="/#how-it-works">Quick guide</Link></li>
              <li><Link href="/auth/login">Sign in</Link></li>
              <li><Link href="/auth/register">Create account</Link></li>
            </ul>
          </nav>

          <section className={styles.contact} aria-labelledby="footer-contact">
            <h2 id="footer-contact">Contact us</h2>
            <div className={styles.contactDetails}>
              {info.email && <a href={'mailto:' + info.email}>{info.email}<ArrowUpRight size={16} aria-hidden="true" /></a>}
              {info.phone && <a href={info.phoneHref!}>{info.phone}</a>}
              {!info.email && !info.phone && <p>Contact details coming soon.</p>}
            </div>
            <p className={styles.srOnly}>Follow us</p>
            <ul className={styles.socials} aria-label="Follow AbangTa">
              {info.socialLinks.map(link => <li key={link.name}>{link.href
                ? <a className={styles.socialButton} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.name + ' (opens in a new tab)'} title={link.name + ' (opens in a new tab)'}><SocialIcon name={link.name} /></a>
                : <span className={styles.unavailable} aria-disabled="true" title={link.name + ' — official page coming soon'}><SocialIcon name={link.name} /><span className={styles.srOnly}>{link.name}: coming soon</span></span>}</li>)}
              {info.email && <li><a className={styles.socialButton} href={'mailto:' + info.email} aria-label="Email AbangTa" title="Email AbangTa"><Mail size={21} strokeWidth={1.7} aria-hidden="true" /></a></li>}
            </ul>
          </section>
        </div>
        <div className={styles.bottom}><p>© {year} AbangTa. All rights reserved.</p><p>Made for the everyday boarding house.</p></div>
      </div>
    </footer>
  );
}
