import Link from 'next/link';
import { ArrowDown, ArrowUpRight, BedDouble, Building2, Check, KeyRound, ReceiptText, Wrench } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/session';
import { BoardingHouseScenery } from '@/components/BoardingHouseScenery';
import { SiteFooter } from '@/components/SiteFooter';
import styles from './landing.module.css';
import { LandingMotion, LandingMagnet } from '@/components/LandingMotion';

export const metadata = {
  title: 'AbangTa — A little less work. A better place to live.',
  description: 'A simpler everyday for Philippine boarding houses. Manage rooms and beds, clear monthly bills, verified payments, and maintenance in one place.',
};

const features = [
  { number: '01', icon: BedDouble, title: 'Every room. Every bed.', text: 'Keep occupants, availability, and agreed rent together. A clear place for everyone who calls your property home.' },
  { number: '02', icon: ReceiptText, title: 'Bills that make sense.', text: 'Rent, utilities, Wi-Fi, and parking, clearly itemized. Record cash or verify GCash payments before issuing a receipt.' },
  { number: '03', icon: Wrench, title: 'Keep everyone in the loop.', text: 'Share property updates, follow maintenance requests, and remind tenants about unpaid bills without repeated messages.' },
];

const questions = [
  { question: 'Is AbangTa for landlords or tenants?', answer: 'Both. Landlords manage their properties, rooms, bills, and requests. Tenants have their own account to view their bills, payments, room details, and maintenance updates.' },
  { question: 'How do tenants join a property?', answer: 'Create a tenant account, then use the room invitation link or QR code shared by your landlord. Your landlord reviews and approves your room assignment.' },
  { question: 'Can I record cash and GCash payments?', answer: 'Yes. Landlords can record cash payments and review GCash proof submitted by tenants. A submitted proof stays pending until confirmed. Only confirmed payments receive receipts.' },
  { question: 'What if Wi-Fi or parking is included?', answer: 'Choose the property’s charging arrangement. Wi-Fi and parking can be charged separately, included, or free. Parking can also be assigned per tenant, so people who do not use it are not charged.' },
];

export default async function RootPage() {
  const user = await getCurrentUser();
  const startHref = user ? '/onboarding' : '/auth/register';
  return (
    <LandingMotion className={styles.landing}>
      <a className={styles.skip} href="#main">Skip to content</a>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="AbangTa home"><span className={styles.brandIcon}><Building2 size={23} strokeWidth={1.7} aria-hidden="true" /></span>AbangTa<span className={styles.brandDot}>.</span></Link>
        <nav className={styles.nav} aria-label="Main navigation"><a href="#features">The essentials</a><a href="#how-it-works">How it works</a><a href="#about">About</a></nav>
        <div className={styles.headerActions}>{!user && <Link className={styles.signIn} href="/auth/login">Sign in</Link>}<Link className={styles.smallButton} href={startHref}>{user ? 'Open dashboard' : 'Get started'}<ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      </header>

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span /> Made for Philippine boarding houses</p>
            <h1 id="hero-title">Less paperwork.<br />More room<br />for <em>living.</em></h1>
            <p className={styles.intro}>Your boarding house, all in one place. A calmer way to manage rooms, collect payments, and keep everyone connected.</p>
            <div className={styles.heroActions}><LandingMagnet><Link className={styles.primaryButton} href={startHref}>{user ? 'Open your dashboard' : 'Make yourself at home'}<ArrowUpRight size={19} aria-hidden="true" /></Link></LandingMagnet><a className={styles.textLink} href="#how-it-works">Take a look<ArrowDown size={16} aria-hidden="true" /></a></div>
            <p className={styles.heroNote}>For landlords who care. For tenants who call it home.</p>
          </div>

          <div className={styles.visual} role="group" aria-label="Illustration of a boarding house with clouds, sunlight, plants, rooms, and a sample monthly bill. All amounts shown are examples.">
            <BoardingHouseScenery loop />
            <div className={styles.visualTop}><span>A little more organized.</span><ArrowUpRight size={20} aria-hidden="true" /></div>
            <div className={styles.house} aria-hidden="true">
              <div className={styles.houseRoof}><span>YOUR PLACE, CONNECTED</span><Building2 size={18} /></div>
              <div className={styles.houseRooms}>{['101', '102', '103', '104'].map((room, index) => <div className={styles.houseRoom} key={room}><div className={styles.window}><span /><span /></div><span className={styles.roomLabel}>ROOM {room}</span><div className={styles.door}><i /></div>{index === 0 && <span className={styles.roomLight} />}</div>)}</div>
              <div className={styles.houseBase} />
            </div>
            <div className={styles.billPreview} aria-hidden="true"><div className={styles.billHeader}><span className={styles.billIcon}><ReceiptText size={18} /></span><span>One clear monthly bill<small>Room 101 · Sample statement</small></span><span className={styles.billBadge}>Itemized</span></div><div className={styles.billLine}><span>Monthly rent</span><span>₱4,000</span></div><div className={styles.billLine}><span>Wi-Fi</span><span>₱300</span></div><div className={styles.billTotal}><span>Total due</span><strong>₱4,300<span>.00</span></strong></div></div>
            <div className={styles.visualBottom}><span><Check size={14} aria-hidden="true" /> Rooms to receipts. Together.</span><span>ILLUSTRATIVE PREVIEW</span></div>
          </div>
        </section>

        <div className={styles.ribbon}><span>A better everyday starts with the basics.</span><div><span>Rooms & beds</span><i /><span>Clear bills</span><i /><span>Connected people</span></div></div>

        <section data-reveal className={styles.section} id="features" aria-labelledby="features-title"><div className={styles.sectionHeading}><p className={styles.eyebrow}>The essentials, in one place</p><h2 id="features-title">Less chasing details.<br />More getting things done.</h2><p>From the first move-in to the next monthly bill, keep the everyday things simple.</p></div><div className={styles.features}>{features.map(feature => <article key={feature.number}><div className={styles.featureTop}><feature.icon size={25} strokeWidth={1.5} aria-hidden="true" /><span>{feature.number}</span></div><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div></section>

        <section data-reveal className={styles.people} aria-labelledby="people-title"><div className={styles.peopleIntro}><p className={styles.eyebrow}>One home. Two perspectives.</p><h2 id="people-title">A place for <br /><em>both of you.</em></h2><p>Different things to do.<br />The same clear picture.</p></div><article className={styles.roleCard}><Building2 size={28} strokeWidth={1.4} aria-hidden="true" /><h3>For the landlord.</h3><p>Know who’s staying, what’s been paid, and what needs your attention.</p><ul><li><Check size={15} aria-hidden="true" /> Manage rooms and individual beds</li><li><Check size={15} aria-hidden="true" /> Review payments and balances</li><li><Check size={15} aria-hidden="true" /> Share updates with your property</li></ul><Link href="/auth/login?role=LANDLORD">Landlord sign in<ArrowUpRight size={19} aria-hidden="true" /></Link></article><article className={styles.roleCard}><KeyRound size={28} strokeWidth={1.4} aria-hidden="true" /><h3>For the tenant.</h3><p>Your room, your records, and a simpler way to stay in touch.</p><ul><li><Check size={15} aria-hidden="true" /> See your own bills and payment history</li><li><Check size={15} aria-hidden="true" /> Submit GCash proof for review</li><li><Check size={15} aria-hidden="true" /> Report repairs and follow updates</li></ul><Link href="/auth/login?role=TENANT">Tenant sign in<ArrowUpRight size={19} aria-hidden="true" /></Link></article></section>

        <section data-reveal className={styles.section} id="how-it-works" aria-labelledby="steps-title"><div className={styles.stepsHeading}><p className={styles.eyebrow}>Settle in, in three steps</p><h2 id="steps-title">Start small.<br />Stay organized.</h2></div><ol className={styles.steps}>{[{ title: 'Create your account.', text: 'Choose landlord or tenant and set up your own AbangTa account.' }, { title: 'Connect your home.', text: 'Landlords add rooms and beds. Tenants request to join using their room’s invitation link or QR code.' }, { title: 'Make everyday easier.', text: 'Keep monthly bills, verified payments, property updates, and repairs in one shared routine.' }].map((step, index) => <li key={step.title}><span>0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol></section>

        <section data-reveal className={styles.faq} aria-labelledby="faq-title"><div><p className={styles.eyebrow}>A few things to know</p><h2 id="faq-title">Glad you asked.</h2></div><div>{questions.map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div></section>

        <section data-reveal className={styles.cta} aria-labelledby="cta-title"><div><p className={styles.eyebrow}>Room for a better everyday</p><h2 id="cta-title">Let’s make room<br />for what matters.</h2></div><Link className={styles.lightButton} href={startHref}>{user ? 'Open dashboard' : 'Get started with AbangTa'}<ArrowUpRight size={21} aria-hidden="true" /></Link></section>
      </main>

      <div id="about" className={styles.footerWrap}><SiteFooter /></div>
    </LandingMotion>
  );
}
