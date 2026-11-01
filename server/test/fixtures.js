// Realistic Tally webhook bodies for the six ARIE forms: real question ids (arieForms.js), labels, types, option ids,
// per-option checkbox booleans, hidden fields and unanswered optional questions (value null), in BG / EN / HE.
// Contact data is fake (example.invalid). Shared by sixforms.test.js (in-memory) and arie.integration.test.js (Postgres).
import { ARIE_FORMS } from '../arieForms.js';

export const choice = (id, label, type, options, picked) => {
    const opts = options.map((text, i) => ({ id: `${id}-opt${i}`, text }));
    const value = picked.map(t => opts.find(o => o.text === t).id);
    const main = { key: `question_${id}`, label, type, value, options: opts };
    // Tally also sends one boolean field per checkbox option
    const perOption = type === 'CHECKBOXES' ? opts.map(o => ({ key: `question_${id}_${o.id}`, label: `${label} (${o.text})`, type, value: value.includes(o.id) })) : [];
    return [main, ...perOption];
};
export const text = (id, label, type, value) => [{ key: `question_${id}`, label, type, value }];
export const hidden = (name, value) => [{ key: `question_h_${name}`, label: name, type: 'HIDDEN_FIELDS', value }];

export const PORTFOLIO_TEXT = {
    q54MpG: { project: ['Какъв проект искате да реализирате?', ['Бизнес уебсайт', 'Лендинг страница за услуга или продукт', 'Онлайн магазин', 'AI автоматизация', 'AI чатбот', 'Бизнес приложение', 'Друго дигитално решение', 'Все още не съм сигурен — имам нужда от консултация']], features: ['Какви допълнителни възможности бихте искали за вашия сайт?', ['Форма за запитвания и контакт', 'Връзка с WhatsApp', 'AI чатбот за посетителите']], name: 'Как да се обръщаме към вас?', email: 'На какъв имейл можем да се свържем с вас?', phone: 'На какъв телефон можем да се свържем с вас?', contact: ['Как предпочитате да се свържем с вас?', ['По имейл', 'По телефон', 'Чрез WhatsApp', 'Нямам предпочитания']], company: 'Как се казва вашата фирма или бизнес?', notes: 'Има ли нещо друго, което бихте искали да ни разкажете за проекта си?' },
    rD5EDo: { project: ['What kind of project would you like to create?', ['Business website', 'Landing page for a service or product', 'Online store', 'AI automation', 'AI chatbot', 'Business application', 'Other digital solution', "I'm not sure yet — I need a consultation"]], features: ['What additional features would you like for your website?', ['Inquiry and contact form', 'WhatsApp integration', 'AI chatbot for visitors']], name: 'How should we address you?', email: 'What email address can we use to contact you?', phone: 'What phone number can we use to contact you?', contact: ['How would you prefer us to contact you?', ['By email', 'By phone', 'Via WhatsApp', 'No preference']], company: 'What is the name of your company or business?', notes: 'Is there anything else you would like to tell us about your project?' },
    '9NBlNE': { project: ['איזה פרויקט תרצו לממש?', ['אתר עסקי', 'דף נחיתה לשירות או למוצר', 'חנות אונליין', 'אוטומציה מבוססת AI', 'צ׳אטבוט AI', 'אפליקציה עסקית', 'פתרון דיגיטלי אחר', 'עדיין לא בטוח/ה — אני צריך/ה ייעוץ']], features: ['אילו אפשרויות נוספות תרצו באתר שלכם?', ['טופס פניות ויצירת קשר', 'חיבור ל־WhatsApp', 'צ׳אטבוט AI למבקרים באתר']], name: 'איך לפנות אליכם?', email: 'לאיזו כתובת אימייל נוכל לפנות אליכם?', phone: 'לאיזה מספר טלפון נוכל לפנות אליכם?', contact: ['איך תעדיפו שניצור איתכם קשר?', ['באימייל', 'בטלפון', 'ב־WhatsApp', 'אין לי העדפה']], company: 'מה שם החברה או העסק שלכם?', notes: 'יש עוד משהו שתרצו לספר לנו על הפרויקט שלכם?' }
};
export const LEARNING_TEXT = {
    rD5KzL: { role: ['Вие сте:', ['Преподавател', 'Частен учител', 'Компания']], topic: 'Каква е темата на обучението?', materials: ['Какви учебни материали имате?', ['PDF и документи', 'Презентации']], features: ['Какви функционалности бихте искали?', ['Тестове с автоматична проверка', 'AI преподавател или асистент']], notes: 'Опишете накратко проекта си.', name: 'Име и фамилия', email: 'Имейл адрес', phone: 'Телефон или WhatsApp' },
    LD90Dy: { role: ['You are:', ['A teacher', 'A private tutor', 'A company']], topic: 'What is the subject of the course?', materials: ['What learning materials do you have?', ['PDFs and documents', 'Presentations']], features: ['Which features would you like?', ['Tests with automatic grading', 'AI tutor or assistant']], notes: 'Briefly describe your project.', name: 'Full name', email: 'Email address', phone: 'Phone or WhatsApp' },
    zEjeEk: { role: ['אתם:', ['מורה / מרצה', 'מורה פרטי/ת', 'חברה']], topic: 'מהו נושא הלימוד?', materials: ['אילו חומרי לימוד יש לכם?', ['קובצי PDF ומסמכים', 'מצגות']], features: ['אילו יכולות תרצו בפלטפורמה?', ['מבחנים עם בדיקה אוטומטית', 'מורה או עוזר AI']], notes: 'תארו בקצרה את הפרויקט שלכם.', name: 'שם מלא', email: 'כתובת אימייל', phone: 'טלפון או WhatsApp' }
};
export const SAMPLE = {
    bg: { name: 'Мария Иванова', company: 'Иванова ЕООД', notes: 'Искаме чатбот за резервации.', topic: 'Математика за 7. клас' },
    en: { name: 'Jane Doe', company: 'Doe Ltd', notes: 'We need a booking chatbot.', topic: 'Excel for beginners' },
    he: { name: 'דנה כהן', company: 'כהן בע״מ', notes: 'אנחנו צריכים צ׳אטבוט להזמנות.', topic: 'מתמטיקה לכיתה ז׳' }
};

export function portfolioPayload(formId, submissionId, { projectIdx = 4, contactIdx = 2, withCalculator = true, omit = [] } = {}) {
    const f = ARIE_FORMS[formId], t = PORTFOLIO_TEXT[formId], s = SAMPLE[f.lang], q = f.q;
    const fields = [
        ...(withCalculator ? [...hidden('services', 'Smart landing page, WhatsApp ordering'), ...hidden('price_range', '€600 – €850'), ...hidden('lang', f.lang)] : []),
        ...choice(q.projectType, t.project[0], 'MULTIPLE_CHOICE', t.project[1], [t.project[1][projectIdx]]),
        ...choice(q.features, t.features[0], 'CHECKBOXES', t.features[1], [t.features[1][1], t.features[1][2]]),
        ...text(q.siteLang, 'site language', 'MULTIPLE_CHOICE', null),
        ...text(q.timing, 'timing', 'MULTIPLE_CHOICE', null), // optional and unanswered: Tally sends it with value null
        ...text(q.notes, t.notes, 'TEXTAREA', s.notes),
        ...text(q.name, t.name, 'INPUT_TEXT', s.name),
        ...text(q.email, t.email, 'INPUT_EMAIL', 'client@example.invalid'),
        ...text(q.phone, t.phone, 'INPUT_PHONE_NUMBER', '+972500000000'),
        ...choice(q.contactPref, t.contact[0], 'MULTIPLE_CHOICE', t.contact[1], [t.contact[1][contactIdx]]),
        ...text(q.company, t.company, 'INPUT_TEXT', s.company)
    ].filter(x => !omit.some(id => x.key.startsWith(`question_${id}`)));
    return { eventId: 'evt_' + submissionId, eventType: 'FORM_RESPONSE', data: { responseId: submissionId, submissionId, formId, formName: 'ARIE', fields } };
}
export function learningPayload(formId, submissionId) {
    const f = ARIE_FORMS[formId], t = LEARNING_TEXT[formId], s = SAMPLE[f.lang], q = f.q;
    const fields = [
        ...choice(q.role, t.role[0], 'MULTIPLE_CHOICE', t.role[1], [t.role[1][1]]),
        ...text(q.topic, t.topic, 'INPUT_TEXT', s.topic),
        ...choice(q.materials, t.materials[0], 'CHECKBOXES', t.materials[1], [t.materials[1][0]]),
        ...choice(q.features, t.features[0], 'CHECKBOXES', t.features[1], t.features[1]),
        ...text(q.timing, 'timing', 'MULTIPLE_CHOICE', null),
        ...text(q.notes, t.notes, 'TEXTAREA', s.notes),
        ...text(q.name, t.name, 'INPUT_TEXT', s.name),
        ...text(q.email, t.email, 'INPUT_EMAIL', 'learner@example.invalid'),
        ...text(q.phone, t.phone, 'INPUT_PHONE_NUMBER', '')
    ];
    return { eventType: 'FORM_RESPONSE', data: { submissionId, formId, fields } };
}

export const payloadFor = (id, sub) => (ARIE_FORMS[id].track === 'portfolio' ? portfolioPayload(id, sub) : learningPayload(id, sub));
