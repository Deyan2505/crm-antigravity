// The six ARIE Tally forms and the stable ids of their questions.
// Tally sends each answer with key "question_<id>"; the id never changes when a label is reworded or translated,
// so the CRM maps answers by these ids instead of by their (BG / EN / HE) labels.
// Ids were read from the Tally API (questions of each form). If a form gets a new question, add its id here.
export const ARIE_FORMS = {
    // ARIE Portfolio — business enquiries (site, landing page, shop, AI automation, chatbot, business app)
    q54MpG: { track: 'portfolio', lang: 'bg', q: { projectType: 'QxWBkX', features: '96yJM5', siteLang: 'eNlxvl', timing: 'WeBp1k', notes: 'ajgrvX', name: '61yQMY', email: '7Jz9M0', phone: 'b2y4v1', contactPref: 'A6Gbye', company: 'BLlb0R' } },
    rD5EDo: { track: 'portfolio', lang: 'en', q: { projectType: 'B8z9VN', features: 'kOdrQM', siteLang: 'vqGWvQ', timing: 'K8YRN7', notes: 'L5ZoB1', name: 'p4bZXb', email: '1GABzW', phone: 'M8eGlX', contactPref: 'J89Bbd', company: 'gWDOXd' } },
    '9NBlNE': { track: 'portfolio', lang: 'he', q: { projectType: 'x9X6EG', features: 'ZPjQX0', siteLang: 'N8pOvG', timing: 'qj4NX2', notes: 'Q8KEpg', name: '92qrYG', email: 'e9qoGq', phone: 'WlOZ6J', contactPref: 'aZQl19', company: '6r8VYe' } },
    // ARIE Learning — individual learning platforms
    rD5KzL: { track: 'learning', lang: 'bg', q: { role: 'gWDOVN', topic: 'yeP7b0', materials: 'XOxN7O', features: '8j1EYA', timing: '0oQAYZ', notes: 'zWxbA1', name: '5EBOYM', email: 'dQWRoz', phone: 'YV5qbq' } },
    LD90Dy: { track: 'learning', lang: 'en', q: { role: 'lVb4j5', topic: 'R8GrQl', materials: 'olbxZ1', features: 'GYx7Vj', timing: 'O8DVZK', notes: 'VoLxaa', name: 'P8dPNQ', email: 'E8kaGo', phone: 'r2jqQM' } },
    zEjeEk: { track: 'learning', lang: 'he', q: { role: 'e9qoOq', topic: 'WlOZbJ', materials: 'aZQlJ9', features: '6r8V0e', timing: '74RP0L', notes: 'bN5ARe', name: 'AW7QRB', email: 'B8z9o7', phone: 'kOdrj6' } }
};
