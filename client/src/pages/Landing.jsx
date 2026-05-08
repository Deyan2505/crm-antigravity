import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, TrendingUp, Mail, Zap, CheckCircle, Star, ArrowRight, Globe, Shield } from 'lucide-react';
import LivingNebulaShader from '../components/ui/living-nebula';

const content = {
    bg: {
        nav: { features: 'Функции', pricing: 'Цени', login: 'Влез', cta: 'Започни безплатно' },
        demoTitle: 'Виж как работи',
        demoSub: 'Попълни формата → лийдът влиза в CRM-а за секунди.',
        demoBtn1: 'Попълни демо формата',
        demoBtn2: 'Създай своя форма в Tally',
        badge: 'CRM специално за малкия бизнес',
        heroTitle: ['Спри да губиш клиенти', 'в хаоса от таблици'],
        heroSub: 'Universal CRM събира всичките ти клиенти, лийдове и сделки на едно място. Свързва се с формите ти, изпраща имейли автоматично и ти показва кой е готов да купи.',
        heroCta1: 'Опитай безплатно',
        heroCta2: 'Вече имам акаунт',
        heroNote: 'Без кредитна карта · Настройка за 5 минути',
        featuresTitle: ['Всичко, което ти трябва', 'и нищо излишно'],
        featuresSub: 'Проектиран за малки агенции и фрийлансъри. Без сложност, без надценки.',
        features: [
            { title: 'Управление на клиенти', desc: 'Всичко за всеки клиент на едно място — контакти, история, оферти, срещи.' },
            { title: 'Pipeline на продажбите', desc: 'Следи всяка сделка от първия контакт до "Спечелено". Без пропуснати възможности.' },
            { title: 'Автоматични имейли', desc: 'Нов лийд от формата? Клиентът получава имейл моментално — без да вдигаш пръст.' },
            { title: 'Webhook интеграции', desc: 'Свързва се с Tally, Make.com и всяка форма. Лийдовете влизат директно в CRM-а.' },
            { title: 'Три езика', desc: 'Работи на Български, English и Иврит. Превключваш с един клик.' },
            { title: 'Сигурен достъп', desc: 'JWT автентикация, хеширани пароли, rate limiting. Данните на клиентите ти са защитени.' },
        ],
        howTitle: ['Работи от', 'деня първи'],
        howSub: 'Три стъпки и си готов.',
        steps: [
            { num: '01', title: 'Регистрирай се', desc: 'Безплатна регистрация за под минута. Без кредитна карта.' },
            { num: '02', title: 'Свържи формата си', desc: 'Добави webhook URL-а в Tally или Make.com. Лийдовете влизат сами.' },
            { num: '03', title: 'Управлявай и продавай', desc: 'Следи статуса на всеки клиент, актуализирай pipeline-а, затваряй сделки.' },
        ],
        pricingTitle: ['Прост и честен', 'ценоразпис'],
        pricingSub: 'Без скрити такси. Без изненади.',
        monthly: 'Месечно',
        yearly: 'Годишно',
        plans: [
            {
                name: 'Starter',
                priceM: '9', priceY: '6',
                period: 'месец',
                desc: 'Перфектно за фрийлансъри и малки агенции',
                features: ['До 200 клиента', 'Неограничени лийдове', 'Webhook интеграция', 'Три езика', 'Имейл нотификации', 'Поддръжка по имейл'],
                cta: 'Започни сега',
                highlight: false,
            },
            {
                name: 'Pro',
                priceM: '19', priceY: '13',
                period: 'месец',
                desc: 'За растящи агенции с екип',
                features: ['Неограничени клиенти', 'Неограничени лийдове', 'Неограничени потребители', 'Персонализиран домейн', 'Приоритетна поддръжка', 'Бял етикет (white label)'],
                cta: 'Избери Pro',
                highlight: true,
            },
        ],
        popular: 'Най-популярен',
        testimonialsTitle: ['Какво казват', 'клиентите'],
        testimonials: [
            { name: 'Мария Д.', role: 'Дигитална агенция', text: 'Спестява ми 2 часа на ден. Вече не губя лийдове в имейлите.' },
            { name: 'Oren K.', role: 'Marketing Consultant', text: "Best CRM I've used for a small agency. Simple and powerful." },
            { name: 'Стефан Н.', role: 'Уеб дизайнер', text: 'Свързах го с Tally за 5 минути. Клиентите влизат автоматично.' },
        ],
        ctaTitle: 'Готов да организираш бизнеса си?',
        ctaSub: 'Присъедини се и спри да губиш клиенти в имейли и таблици.',
        ctaBtn: 'Започни безплатно',
        footerCopy: '© 2025 Universal CRM · Всички права запазени',
        footerLogin: 'Влез',
        footerSignup: 'Регистрация',
        mockupNav: ['Табло', 'Клиенти', 'Запитвания', 'Настройки'],
        mockupStats: [['24', 'Клиенти'], ['8', 'Лийдове'], ['3', 'Срещи'], ['12K', 'Приходи']],
    },
    en: {
        nav: { features: 'Features', pricing: 'Pricing', login: 'Log in', cta: 'Start for free' },
        demoTitle: 'See it in action',
        demoSub: 'Fill out the form → the lead appears in the CRM within seconds.',
        demoBtn1: 'Fill out the demo form',
        demoBtn2: 'Create your own form in Tally',
        badge: 'CRM built for small business',
        heroTitle: ['Stop losing clients', 'in spreadsheet chaos'],
        heroSub: 'Universal CRM keeps all your clients, leads, and deals in one place. Connects to your forms, sends emails automatically, and shows you who\'s ready to buy.',
        heroCta1: 'Try for free',
        heroCta2: 'I already have an account',
        heroNote: 'No credit card · Setup in 5 minutes',
        featuresTitle: ['Everything you need,', 'nothing you don\'t'],
        featuresSub: 'Designed for small agencies and freelancers. No complexity, no bloat.',
        features: [
            { title: 'Client Management', desc: 'Everything about every client in one place — contacts, history, quotes, meetings.' },
            { title: 'Sales Pipeline', desc: 'Track every deal from first contact to "Won". Never miss an opportunity.' },
            { title: 'Automated Emails', desc: 'New lead from your form? The client gets an email instantly — without lifting a finger.' },
            { title: 'Webhook Integrations', desc: 'Connects with Tally, Make.com, and any form. Leads flow directly into your CRM.' },
            { title: 'Three Languages', desc: 'Works in Bulgarian, English, and Hebrew. Switch with one click.' },
            { title: 'Secure Access', desc: 'JWT auth, hashed passwords, rate limiting. Your client data is protected.' },
        ],
        howTitle: ['Up and running', 'from day one'],
        howSub: 'Three steps and you\'re ready.',
        steps: [
            { num: '01', title: 'Sign up', desc: 'Free registration in under a minute. No credit card required.' },
            { num: '02', title: 'Connect your form', desc: 'Add the webhook URL in Tally or Make.com. Leads come in automatically.' },
            { num: '03', title: 'Manage and sell', desc: 'Track every client\'s status, update your pipeline, close deals.' },
        ],
        pricingTitle: ['Simple, honest', 'pricing'],
        pricingSub: 'No hidden fees. No surprises.',
        monthly: 'Monthly',
        yearly: 'Yearly',
        plans: [
            {
                name: 'Starter',
                priceM: '9', priceY: '6',
                period: 'mo',
                desc: 'Perfect for freelancers and small agencies',
                features: ['Up to 200 clients', 'Unlimited leads', 'Webhook integration', 'Three languages', 'Email notifications', 'Email support'],
                cta: 'Get started',
                highlight: false,
            },
            {
                name: 'Pro',
                priceM: '19', priceY: '13',
                period: 'mo',
                desc: 'For growing agencies with a team',
                features: ['Unlimited clients', 'Unlimited leads', 'Unlimited users', 'Custom domain', 'Priority support', 'White label'],
                cta: 'Choose Pro',
                highlight: true,
            },
        ],
        popular: 'Most popular',
        testimonialsTitle: ['What our', 'customers say'],
        testimonials: [
            { name: 'Maria D.', role: 'Digital Agency', text: 'Saves me 2 hours a day. I no longer lose leads in my inbox.' },
            { name: 'Oren K.', role: 'Marketing Consultant', text: "Best CRM I've used for a small agency. Simple and powerful." },
            { name: 'Stefan N.', role: 'Web Designer', text: 'Connected it to Tally in 5 minutes. Clients come in automatically.' },
        ],
        ctaTitle: 'Ready to organize your business?',
        ctaSub: 'Join us and stop losing clients in emails and spreadsheets.',
        ctaBtn: 'Start for free',
        footerCopy: '© 2025 Universal CRM · All rights reserved',
        footerLogin: 'Log in',
        footerSignup: 'Sign up',
        mockupNav: ['Dashboard', 'Clients', 'Leads', 'Settings'],
        mockupStats: [['24', 'Clients'], ['8', 'Leads'], ['3', 'Meetings'], ['12K', 'Revenue']],
    },
};

const featureIcons = [
    <Users size={28} />,
    <TrendingUp size={28} />,
    <Mail size={28} />,
    <Zap size={28} />,
    <Globe size={28} />,
    <Shield size={28} />,
];

const Landing = () => {
    const [billingYearly, setBillingYearly] = useState(false);
    const [lang, setLang] = useState('en');
    const c = content[lang];

    return (
        <div className="landing">
            <LivingNebulaShader />
            {/* ── NAV ── */}
            <nav className="landing-nav">
                <div className="landing-container landing-nav-inner">
                    <div className="landing-logo">
                        <div className="landing-logo-icon">CRM</div>
                        <span>Universal CRM</span>
                    </div>
                    <div className="landing-nav-links">
                        <a href="#features">{c.nav.features}</a>
                        <a href="#pricing">{c.nav.pricing}</a>
                        <button
                            className="landing-lang-toggle"
                            onClick={() => setLang(l => l === 'bg' ? 'en' : 'bg')}
                        >
                            {lang === 'bg' ? '🇬🇧 EN' : '🇧🇬 БГ'}
                        </button>
                        <Link to="/login" className="landing-nav-login">{c.nav.login}</Link>
                        <Link to="/signup" className="landing-btn-primary landing-btn-sm">{c.nav.cta}</Link>
                    </div>
                </div>
            </nav>

            {/* ── HERO ── */}
            <section className="landing-hero">
                <div className="landing-hero-glow" />
                <div className="landing-container landing-hero-inner">
                    <div className="landing-badge">
                        <Star size={14} />
                        <span>{c.badge}</span>
                    </div>
                    <h1 className="landing-hero-title">
                        {c.heroTitle[0]}<br />
                        <span className="landing-gradient-text">{c.heroTitle[1]}</span>
                    </h1>
                    <p className="landing-hero-sub">{c.heroSub}</p>
                    <div className="landing-hero-ctas">
                        <Link to="/signup" className="landing-btn-primary landing-btn-lg">
                            {c.heroCta1}
                            <ArrowRight size={18} />
                        </Link>
                        <Link to="/login" className="landing-btn-ghost landing-btn-lg">
                            {c.heroCta2}
                        </Link>
                    </div>
                    <p className="landing-hero-note">{c.heroNote}</p>

                    {/* Mock dashboard preview */}
                    <div className="landing-mockup">
                        <div className="landing-mockup-bar">
                            <span /><span /><span />
                        </div>
                        <div className="landing-mockup-body">
                            <div className="landing-mockup-sidebar">
                                {c.mockupNav.map(item => (
                                    <div key={item} className="landing-mockup-nav-item">{item}</div>
                                ))}
                            </div>
                            <div className="landing-mockup-content">
                                <div className="landing-mockup-stats">
                                    {c.mockupStats.map(([val, label]) => (
                                        <div key={label} className="landing-mockup-stat">
                                            <div className="landing-mockup-stat-val">{val}</div>
                                            <div className="landing-mockup-stat-label">{label}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="landing-mockup-table">
                                    {[
                                        ['Иван Петров', 'TechBG', 'Спечелен'],
                                        ['Мария Иванова', 'StartUp BG', 'Среща'],
                                        ['Georgi A.', 'Export Ltd', 'Оферта'],
                                    ].map(([name, company, status]) => (
                                        <div key={name} className="landing-mockup-row">
                                            <div className="landing-mockup-avatar">{name[0]}</div>
                                            <div className="landing-mockup-cell-name">
                                                <span>{name}</span>
                                                <small>{company}</small>
                                            </div>
                                            <div className={`landing-mockup-badge landing-status-${status.toLowerCase()}`}>{status}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── FEATURES ── */}
            <section className="landing-section" id="features">
                <div className="landing-container">
                    <div className="landing-section-header">
                        <h2>{c.featuresTitle[0]}<br /><span className="landing-gradient-text">{c.featuresTitle[1]}</span></h2>
                        <p>{c.featuresSub}</p>
                    </div>
                    <div className="landing-features-grid">
                        {c.features.map((f, i) => (
                            <div key={f.title} className="landing-feature-card">
                                <div className="landing-feature-icon">{featureIcons[i]}</div>
                                <h3>{f.title}</h3>
                                <p>{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section className="landing-section landing-section-dark">
                <div className="landing-container">
                    <div className="landing-section-header">
                        <h2>{c.howTitle[0]} <span className="landing-gradient-text">{c.howTitle[1]}</span></h2>
                        <p>{c.howSub}</p>
                    </div>
                    <div className="landing-steps">
                        {c.steps.map((s, i) => (
                            <div key={s.num} className="landing-step">
                                <div className="landing-step-num">{s.num}</div>
                                <h3>{s.title}</h3>
                                <p>{s.desc}</p>
                                {i < c.steps.length - 1 && <div className="landing-step-arrow">→</div>}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── DEMO ── */}
            <section className="landing-section landing-demo-section">
                <div className="landing-container">
                    <div className="landing-section-header">
                        <h2><span className="landing-gradient-text">{c.demoTitle}</span></h2>
                        <p>{c.demoSub}</p>
                    </div>
                    <div className="landing-demo-btns">
                        <a
                            href="https://tally.so/r/q4Rd92"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="landing-btn-primary landing-btn-lg"
                        >
                            {c.demoBtn1}
                            <ArrowRight size={18} />
                        </a>
                        <a
                            href="https://tally.so"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="landing-btn-ghost landing-btn-lg"
                        >
                            {c.demoBtn2}
                        </a>
                    </div>
                </div>
            </section>

            {/* ── PRICING ── */}
            <section className="landing-section" id="pricing">
                <div className="landing-container">
                    <div className="landing-section-header">
                        <h2>{c.pricingTitle[0]} <span className="landing-gradient-text">{c.pricingTitle[1]}</span></h2>
                        <p>{c.pricingSub}</p>
                        <div className="landing-billing-toggle">
                            <span className={!billingYearly ? 'active' : ''}>{c.monthly}</span>
                            <button
                                className={`landing-toggle ${billingYearly ? 'on' : ''}`}
                                onClick={() => setBillingYearly(!billingYearly)}
                            />
                            <span className={billingYearly ? 'active' : ''}>{c.yearly} <span className="landing-discount">-33%</span></span>
                        </div>
                    </div>
                    <div className="landing-pricing-grid">
                        {c.plans.map(plan => (
                            <div key={plan.name} className={`landing-pricing-card ${plan.highlight ? 'highlighted' : ''}`}>
                                {plan.highlight && <div className="landing-popular-badge">{c.popular}</div>}
                                <div className="landing-plan-name">{plan.name}</div>
                                <div className="landing-plan-price">
                                    <span className="landing-currency">$</span>
                                    <span className="landing-amount">{billingYearly ? plan.priceY : plan.priceM}</span>
                                    <span className="landing-period">/{plan.period}</span>
                                </div>
                                <p className="landing-plan-desc">{plan.desc}</p>
                                <ul className="landing-plan-features">
                                    {plan.features.map(f => (
                                        <li key={f}>
                                            <CheckCircle size={16} className="landing-check" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    to="/signup"
                                    className={plan.highlight ? 'landing-btn-primary landing-btn-full' : 'landing-btn-outline landing-btn-full'}
                                >
                                    {plan.cta}
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── TESTIMONIALS ── */}
            <section className="landing-section landing-section-dark">
                <div className="landing-container">
                    <div className="landing-section-header">
                        <h2>{c.testimonialsTitle[0]} <span className="landing-gradient-text">{c.testimonialsTitle[1]}</span></h2>
                    </div>
                    <div className="landing-testimonials">
                        {c.testimonials.map(t => (
                            <div key={t.name} className="landing-testimonial">
                                <div className="landing-stars">{'★★★★★'}</div>
                                <p>"{t.text}"</p>
                                <div className="landing-testimonial-author">
                                    <div className="landing-testimonial-avatar">{t.name[0]}</div>
                                    <div>
                                        <strong>{t.name}</strong>
                                        <small>{t.role}</small>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FINAL CTA ── */}
            <section className="landing-cta-section">
                <div className="landing-container landing-cta-inner">
                    <h2>{c.ctaTitle}</h2>
                    <p>{c.ctaSub}</p>
                    <Link to="/signup" className="landing-btn-primary landing-btn-lg">
                        {c.ctaBtn}
                        <ArrowRight size={18} />
                    </Link>
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer className="landing-footer">
                <div className="landing-container landing-footer-inner">
                    <div className="landing-logo">
                        <div className="landing-logo-icon">CRM</div>
                        <span>Universal CRM</span>
                    </div>
                    <p className="landing-footer-copy">{c.footerCopy}</p>
                    <div className="landing-footer-links">
                        <Link to="/login">{c.footerLogin}</Link>
                        <Link to="/signup">{c.footerSignup}</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
