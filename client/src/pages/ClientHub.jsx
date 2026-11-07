import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Phone, Mail, MessageCircle, CalendarDays, StickyNote, Flag, Info, Inbox } from 'lucide-react';
import Modal from '../components/Modal';
import ErrorBanner from '../components/ErrorBanner';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch } from '../utils/api';
import { ApiError } from '../utils/apiCore';
import {
    KINDS, KIND_KEYS, CONTACT_KEYS, STATUS_KEYS, TRACK_KEYS, isClientId, nextActionState, formatDay, formatDateTime,
    toLocalInput, fromLocalInput, answersOf, inquiryFacts, projectsOf, profileNotes
} from '../utils/hub';

// Client Hub 360: everything known about one client on one page. Data comes from GET /api/clients/:id/hub; every write goes to the API
// and the page shows the saved state only after the server confirmed it (it then re-reads the dossier).
const TABS = ['overview', 'inquiries', 'timeline'];
const KIND_ICON = { note: StickyNote, call: Phone, email: Mail, whatsapp: MessageCircle, meeting: CalendarDays };

const Notice = ({ children }) => <p className="hub-note"><Info size={16} /><span>{children}</span></p>;

const EntryForm = ({ value, onChange, onSubmit, onCancel, saving, error, submitLabel, textRef, idPrefix }) => {
    const { t } = useLanguage();
    return (
        <form className="hub-entry-form" onSubmit={onSubmit}>
            <ErrorBanner error={error} />
            <div className="hub-kinds" role="radiogroup" aria-label={t('hub_entry_type')}>
                {KINDS.map(k => {
                    const Icon = KIND_ICON[k];
                    return (
                        <label key={k} className={`hub-kind hub-kind--${k}${value.kind === k ? ' is-on' : ''}`}>
                            <input type="radio" name={`${idPrefix}-kind`} value={k} checked={value.kind === k} onChange={() => onChange({ ...value, kind: k })} />
                            <Icon size={15} /> {t(KIND_KEYS[k])}
                        </label>
                    );
                })}
            </div>
            <div className="form-group">
                <label htmlFor={`${idPrefix}-when`}>{t('hub_entry_when')}</label>
                <input id={`${idPrefix}-when`} type="datetime-local" value={value.when} onChange={e => onChange({ ...value, when: e.target.value })} required />
            </div>
            <div className="form-group">
                <label htmlFor={`${idPrefix}-text`}>{t('hub_entry_text')}</label>
                <textarea id={`${idPrefix}-text`} ref={textRef} rows="4" maxLength={5000} value={value.body} onChange={e => onChange({ ...value, body: e.target.value })} />
            </div>
            <div className="modal-footer" style={{ marginTop: 0 }}>
                {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>{t('cancel')}</button>}
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('saving') : submitLabel}</button>
            </div>
        </form>
    );
};

const ClientHub = () => {
    const { id } = useParams();
    const { t, language } = useLanguage();
    const [params, setParams] = useSearchParams();
    const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview';
    const setTab = next => setParams(next === 'overview' ? {} : { tab: next }, { replace: true });

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);      // the last failed read; the data on screen (if any) is the last confirmed one
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [profile, setProfile] = useState(null);  // profile modal: form values, or null when closed
    const [contactTouched, setContactTouched] = useState(false);
    const [nextForm, setNextForm] = useState(null);
    const [formError, setFormError] = useState(null);

    const newEntry = () => ({ kind: 'note', body: '', when: toLocalInput() });
    const [entry, setEntry] = useState(newEntry);
    const [entryError, setEntryError] = useState(null);
    const [editing, setEditing] = useState(null);   // { id, kind, body, when } of the entry being edited
    const [editError, setEditError] = useState(null);
    const composerText = useRef(null);
    const [focusComposer, setFocusComposer] = useState(false);

    const valid = isClientId(id);
    const load = useCallback(async (silent = false) => {
        if (!valid) { setLoading(false); return; }
        if (!silent) setLoading(true);
        try {
            const json = await apiFetch(`/api/clients/${id}/hub`);
            if (!json || !json.client || !Array.isArray(json.inquiries) || !Array.isArray(json.activities) || !json.capabilities) throw new ApiError(200, 'BAD_RESPONSE');
            setData(json);
            setError(null);
        } catch (err) { setError(err); } finally { setLoading(false); }
    }, [id, valid]);
    useEffect(() => { setData(null); setError(null); load(); }, [load]);
    useEffect(() => {
        if (focusComposer && tab === 'timeline' && composerText.current) { composerText.current.focus(); setFocusComposer(false); }
    }, [focusComposer, tab, data]);

    const projects = useMemo(() => (data ? projectsOf(data.client, data.inquiries) : []), [data]);

    // ---- states without data ---------------------------------------------------------------------------------------------------------
    if (!valid || (error && error.status === 404)) {
        return <div className="hub"><Link className="hub-back" to="/app/clients"><ArrowLeft size={16} />{t('hub_back')}</Link><div className="hub-card hub-empty"><Inbox size={28} /><p>{t('hub_not_found')}</p></div></div>;
    }
    if (!data) {
        return (
            <div className="hub">
                <Link className="hub-back" to="/app/clients"><ArrowLeft size={16} />{t('hub_back')}</Link>
                {error ? <><ErrorBanner error={error} /><div><button className="btn btn-secondary" onClick={() => load()}>{t('retry')}</button></div></>
                    : <div className="hub-card hub-empty" role="status">{loading ? t('hub_loading') : ''}</div>}
            </div>
        );
    }

    const { client, inquiries, activities, last_contact_at: lastContact, capabilities: caps } = data;
    const dash = <span className="hub-muted">{t('not_specified')}</span>;
    const val = v => (v === '' || v === null || v === undefined ? dash : v);
    const now = new Date();
    const lastEntry = activities.find(a => new Date(a.occurred_at) <= now);
    const due = client.next_action_due;
    const dueState = nextActionState(due);
    const hasNext = !!(client.next_action || due);
    const statusKey = STATUS_KEYS[client.status];
    const contactLabel = c => (CONTACT_KEYS[c] ? t(CONTACT_KEYS[c]) : c);
    const track = client.track && TRACK_KEYS[client.track] ? t(TRACK_KEYS[client.track]) : '';
    const ownNotes = profileNotes(client, inquiries);

    // ---- writes: the dossier is re-read only after the server confirmed them ---------------------------------------------------------
    const run = async (fn, setErr) => {
        if (saving) return false;
        setSaving(true); setErr(null);
        try { await fn(); await load(true); return true; } catch (err) { setErr(err); return false; } finally { setSaving(false); }
    };

    const openProfile = () => {
        setProfile({ name: client.name || '', company: client.company || '', email: client.email || '', phone: client.phone || '', country: client.country || '', preferred_contact: client.preferred_contact || 'Unspecified' });
        setContactTouched(false); setFormError(null);
    };
    const saveProfile = async e => {
        e.preventDefault();
        if (!profile.name.trim()) { setFormError(new ApiError(400, 'VALIDATION', t('name_required'))); return; }
        const body = { name: profile.name, company: profile.company, email: profile.email, phone: profile.phone };
        if (caps.profileFields) body.country = profile.country;
        if (contactTouched) body.preferred_contact = profile.preferred_contact; // an untouched (empty or old free-text) value stays as it is
        if (await run(() => apiFetch(`/api/clients/${client.id}`, { method: 'PUT', body }), setFormError)) setProfile(null);
    };

    const openNext = () => { setNextForm({ next_action: client.next_action || '', next_action_due: due || '' }); setFormError(null); };
    const saveNext = async e => {
        e.preventDefault();
        if (nextForm.next_action_due && !nextForm.next_action.trim()) { setFormError(new ApiError(400, 'VALIDATION', t('hub_action_needs_text'))); return; }
        if (await run(() => apiFetch(`/api/clients/${client.id}`, { method: 'PUT', body: nextForm }), setFormError)) setNextForm(null);
    };

    const checkEntry = v => (!v.body.trim() ? t('hub_text_required') : !fromLocalInput(v.when) ? t('hub_date_required') : null);
    const addEntry = async e => {
        e.preventDefault();
        const problem = checkEntry(entry);
        if (problem) { setEntryError(new ApiError(400, 'VALIDATION', problem)); return; }
        const ok = await run(() => apiFetch(`/api/clients/${client.id}/activities`, { method: 'POST', body: { kind: entry.kind, body: entry.body, occurred_at: fromLocalInput(entry.when) } }), setEntryError);
        if (ok) setEntry(newEntry());
    };
    const saveEdit = async e => {
        e.preventDefault();
        const problem = checkEntry(editing);
        if (problem) { setEditError(new ApiError(400, 'VALIDATION', problem)); return; }
        const ok = await run(() => apiFetch(`/api/clients/${client.id}/activities/${editing.id}`, { method: 'PUT', body: { kind: editing.kind, body: editing.body, occurred_at: fromLocalInput(editing.when) } }), setEditError);
        if (ok) setEditing(null);
    };
    const startEdit = a => { setEditing({ id: a.id, kind: a.kind, body: a.body, when: toLocalInput(a.occurred_at) }); setEditError(null); };

    const dueText = dueState === 'overdue' ? `${t('hub_overdue')} · ${formatDay(due, language)}`
        : dueState === 'today' ? t('hub_due_today') : due ? `${t('hub_due')}: ${formatDay(due, language)}` : t('hub_due_none');
    const input = (name, label, props = {}) => (
        <div className="form-group">
            <label htmlFor={`p-${name}`}>{label}</label>
            <input id={`p-${name}`} value={profile[name]} onChange={e => setProfile({ ...profile, [name]: e.target.value })} {...props} />
        </div>
    );

    return (
        <div className="hub">
            <Link className="hub-back" to="/app/clients"><ArrowLeft size={16} />{t('hub_back')}</Link>
            <ErrorBanner error={error} onClose={() => setError(null)} />

            {/* A. profile header */}
            <header className="hub-card">
                <div className="hub-head">
                    <div className="hub-identity">
                        <div className="hub-avatar" aria-hidden="true">{(client.name || '?').charAt(0).toUpperCase()}</div>
                        <div style={{ minWidth: 0 }}>
                            <h1 className="hub-title">{client.name}</h1>
                            {client.company && <div className="hub-sub">{client.company}</div>}
                            <div className="hub-chips">
                                <span className={`hub-chip hub-status hub-status--${(client.status || 'New').toLowerCase()}`}>{statusKey ? t(statusKey) : client.status}</span>
                                {track && <span className="hub-chip">{track}</span>}
                                {client.lang && <span className="hub-chip">{String(client.lang).toUpperCase()}</span>}
                                {client.source && <span className="hub-chip">{client.source}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="hub-actions">
                        <button className="btn btn-secondary" onClick={openProfile}><Pencil size={16} />{t('hub_edit_profile')}</button>
                        <button className="btn btn-primary" onClick={() => { setTab('timeline'); setFocusComposer(true); }} disabled={!caps.activities}><Plus size={16} />{t('hub_add_entry')}</button>
                    </div>
                </div>
                <div className="hub-contact">
                    {client.email && <a href={`mailto:${client.email}`}><Mail size={15} />{client.email}</a>}
                    {client.phone && <a href={`tel:${client.phone}`} dir="ltr"><Phone size={15} />{client.phone}</a>}
                    {!client.email && !client.phone && <span className="hub-muted">{t('not_specified')}</span>}
                    {client.preferred_contact && client.preferred_contact !== 'Unspecified' && <span className="hub-muted">{t('preferred_contact')}: {contactLabel(client.preferred_contact)}</span>}
                </div>
            </header>

            {/* E. next action: always visible, whatever tab is open */}
            <section className={`hub-next hub-next--${dueState}`} aria-label={t('hub_next_action')}>
                <Flag size={20} aria-hidden="true" />
                <div className="hub-next-body">
                    <span className="hub-label">{t('hub_next_action')}</span>
                    {hasNext ? <><strong>{client.next_action || t('not_specified')}</strong><span className="hub-due">{dueText}</span></>
                        : <span className="hub-muted">{caps.profileFields ? t('hub_next_action_empty') : t('hub_migration')}</span>}
                </div>
                {caps.profileFields && <button className="btn btn-secondary" onClick={openNext}>{hasNext ? t('edit') : t('hub_next_action_set')}</button>}
            </section>

            <div className="hub-stats">
                <div className="hub-stat"><span className="hub-label">{t('status')}</span><strong>{statusKey ? t(statusKey) : client.status}</strong></div>
                <div className="hub-stat"><span className="hub-label">{t('hub_last_activity')}</span>
                    <strong>{lastEntry ? formatDateTime(lastEntry.occurred_at, language) : t('hub_none_yet')}</strong>
                    {lastEntry && <span className="hub-muted">{t(KIND_KEYS[lastEntry.kind])}</span>}</div>
                <div className="hub-stat"><span className="hub-label">{t('hub_last_contact')}</span><strong>{lastContact ? formatDateTime(lastContact, language) : t('hub_none_yet')}</strong></div>
                <div className="hub-stat"><span className="hub-label">{t('hub_inquiries')}</span><strong>{inquiries.length}</strong></div>
            </div>

            <div className="hub-tabs" role="tablist">
                {TABS.map(k => (
                    <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} className="hub-tab" onClick={() => setTab(k)}>
                        {t(`hub_tab_${k}`)}
                        {k === 'inquiries' && <span className="hub-count">{inquiries.length}</span>}
                        {k === 'timeline' && caps.activities && <span className="hub-count">{activities.length}</span>}
                    </button>
                ))}
            </div>

            {/* A + B: profile and project */}
            {tab === 'overview' && (
                <div className="hub-grid" role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
                    <section className="hub-card">
                        <h3>{t('hub_profile')}</h3>
                        <dl className="hub-dl">
                            <div className="hub-field"><dt>{t('name')}</dt><dd>{client.name}</dd></div>
                            <div className="hub-field"><dt>{t('company')}</dt><dd>{val(client.company)}</dd></div>
                            <div className="hub-field"><dt>{t('email')}</dt><dd>{val(client.email)}</dd></div>
                            <div className="hub-field"><dt>{t('phone')}</dt><dd>{client.phone ? <bdi dir="ltr">{client.phone}</bdi> : dash}</dd></div>
                            <div className="hub-field"><dt>{t('preferred_contact')}</dt><dd>{client.preferred_contact && client.preferred_contact !== 'Unspecified' ? contactLabel(client.preferred_contact) : dash}</dd></div>
                            <div className="hub-field"><dt>{t('hub_lang')}</dt><dd>{client.lang ? String(client.lang).toUpperCase() : dash}</dd></div>
                            <div className="hub-field"><dt>{t('hub_country')}</dt><dd>{caps.profileFields ? val(client.country) : dash}</dd></div>
                            <div className="hub-field"><dt>{t('hub_source')}</dt><dd>{val(client.source)}</dd></div>
                            <div className="hub-field"><dt>{t('hub_created')}</dt><dd>{formatDateTime(client.created_at, language) || dash}</dd></div>
                            <div className="hub-field"><dt>{t('hub_updated')}</dt><dd>{formatDateTime(client.updated_at, language) || dash}</dd></div>
                            {client.meeting_date && <div className="hub-field"><dt>{t('meeting_date')}</dt><dd>{formatDateTime(client.meeting_date, language)}</dd></div>}
                            {client.deal_value !== null && client.deal_value !== undefined && Number(client.deal_value) > 0 && <div className="hub-field"><dt>{t('deal_value')}</dt><dd>{client.deal_value}</dd></div>}
                            {client.lost_reason && <div className="hub-field wide"><dt>{t('lost_reason')}</dt><dd className="hub-pre">{client.lost_reason}</dd></div>}
                            {ownNotes && <div className="hub-field wide"><dt>{t('notes')}</dt><dd className="hub-pre">{ownNotes}</dd></div>}
                        </dl>
                        {!caps.profileFields && <Notice>{t('hub_migration')}</Notice>}
                    </section>
                    <section className="hub-card">
                        <h3>{t('hub_project')}</h3>
                        <div className="hub-projects">
                            {projects.map(p => (
                                <div key={p.key} className="hub-project">
                                    <div className="hub-project-head">
                                        <strong>{p.projectType || t('not_specified')}</strong>
                                        {p.track && TRACK_KEYS[p.track] && <span className="hub-chip">{t(TRACK_KEYS[p.track])}</span>}
                                        {p.createdAt && <time className="hub-muted" dateTime={new Date(p.createdAt).toISOString()}>{formatDateTime(p.createdAt, language)}</time>}
                                    </div>
                                    <dl className="hub-dl">
                                        <div className="hub-field"><dt>{t('hub_budget')}</dt><dd>{p.budget ? <bdi dir="ltr">{p.budget}</bdi> : dash}</dd></div>
                                        <div className="hub-field"><dt>{t('hub_timing')}</dt><dd>{val(p.timing)}</dd></div>
                                        <div className="hub-field wide"><dt>{t('hub_description')}</dt><dd className="hub-pre">{val(p.description)}</dd></div>
                                        <div className="hub-field wide"><dt>{t('hub_features')}</dt><dd>{val(p.features)}</dd></div>
                                        {p.siteLang && <div className="hub-field"><dt>{t('hub_site_lang')}</dt><dd>{p.siteLang}</dd></div>}
                                        {p.role && <div className="hub-field"><dt>{t('hub_role')}</dt><dd>{p.role}</dd></div>}
                                        {p.materials && <div className="hub-field wide"><dt>{t('hub_materials')}</dt><dd>{p.materials}</dd></div>}
                                    </dl>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {/* C: linked inquiries with the original Tally answers */}
            {tab === 'inquiries' && (
                <div className="hub-stack" role="tabpanel" id="panel-inquiries" aria-labelledby="tab-inquiries">
                    <Notice>{t('hub_inq_note')}</Notice>
                    {inquiries.length === 0 && <div className="hub-card hub-empty"><Inbox size={28} /><p>{t('hub_inq_empty')}</p></div>}
                    {inquiries.map(inq => {
                        const f = inquiryFacts(inq);
                        const answers = answersOf(inq.data);
                        return (
                            <article key={inq.id} className="hub-card hub-inquiry">
                                <div className="hub-inq-head">
                                    <strong>{formatDateTime(f.createdAt, language)}</strong>
                                    <div className="hub-chips" style={{ marginTop: 0 }}>
                                        {f.source && <span className="hub-chip">{f.source}</span>}
                                        {f.lang && <span className="hub-chip">{f.lang.toUpperCase()}</span>}
                                        {f.track && TRACK_KEYS[f.track] && <span className="hub-chip">{t(TRACK_KEYS[f.track])}</span>}
                                        <span className="hub-chip">{inq.link === 'explicit' ? t('hub_inq_explicit') : t('hub_inq_by_submission')}</span>
                                    </div>
                                </div>
                                {f.projectType && <p className="hub-inq-type">{t('hub_project_type')}: <strong>{f.projectType}</strong></p>}
                                <details>
                                    <summary>{t('hub_inq_answers')} ({answers.length})</summary>
                                    {answers.length === 0 ? <p className="hub-muted">{t('hub_inq_no_answers')}</p> : (
                                        <dl className="hub-answers">
                                            {answers.map((a, i) => <div key={i}><dt>{a.label}</dt><dd className="hub-pre">{a.value}</dd></div>)}
                                        </dl>
                                    )}
                                    {(f.formId || f.submissionId) && <p className="hub-ids">{f.formId && `${t('hub_inq_form')}: ${f.formId}`}{f.formId && f.submissionId && ' · '}{f.submissionId && `Tally ID: ${f.submissionId}`}</p>}
                                </details>
                            </article>
                        );
                    })}
                </div>
            )}

            {/* D: communication history, entered by hand */}
            {tab === 'timeline' && (
                <div className="hub-stack" role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline">
                    {!caps.activities ? <Notice>{t('hub_migration')}</Notice> : (
                        <>
                            <Notice>{t('hub_timeline_note')}</Notice>
                            <section className="hub-card">
                                <EntryForm idPrefix="new" value={entry} onChange={setEntry} onSubmit={addEntry} saving={saving} error={entryError} submitLabel={t('hub_entry_save')} textRef={composerText} />
                            </section>
                            {activities.length === 0 ? <div className="hub-card hub-empty"><Inbox size={28} /><p>{t('hub_timeline_empty')}</p></div> : (
                                <ol className="hub-timeline">
                                    {activities.map(a => {
                                        const Icon = KIND_ICON[a.kind] || StickyNote;
                                        const isEditing = editing && editing.id === a.id;
                                        const edited = new Date(a.updated_at) - new Date(a.created_at) > 1000;
                                        return (
                                            <li key={a.id} className={`hub-entry hub-entry--${a.kind}`}>
                                                <span className="hub-dot" aria-hidden="true"><Icon size={16} /></span>
                                                <div className="hub-card hub-entry-card">
                                                    {isEditing ? (
                                                        <EntryForm idPrefix={`e${a.id}`} value={editing} onChange={setEditing} onSubmit={saveEdit} onCancel={() => setEditing(null)} saving={saving} error={editError} submitLabel={t('save_changes')} />
                                                    ) : (
                                                        <>
                                                            <div className="hub-entry-head">
                                                                <strong>{t(KIND_KEYS[a.kind])}</strong>
                                                                <time dateTime={new Date(a.occurred_at).toISOString()}>{formatDateTime(a.occurred_at, language)}</time>
                                                                {edited && <span className="hub-muted">· {t('hub_entry_edited')}</span>}
                                                                <button className="btn-icon hub-entry-edit" title={t('hub_entry_edit')} aria-label={t('hub_entry_edit')} onClick={() => startEdit(a)}><Pencil size={14} /></button>
                                                            </div>
                                                            <p className="hub-pre hub-entry-body">{a.body}</p>
                                                        </>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </>
                    )}
                </div>
            )}

            <Modal isOpen={!!profile} onClose={() => setProfile(null)} title={t('hub_edit_profile_title')}>
                {profile && (
                    <form onSubmit={saveProfile}>
                        <ErrorBanner error={formError} />
                        {input('name', t('name'), { required: true })}
                        {input('company', t('company'))}
                        <div className="hub-two">
                            {input('email', t('email'), { type: 'email' })}
                            {input('phone', t('phone'), { type: 'tel', dir: 'ltr' })}
                        </div>
                        <div className="hub-two">
                            {caps.profileFields ? input('country', t('hub_country')) : <div />}
                            <div className="form-group">
                                <label htmlFor="p-contact">{t('preferred_contact')}</label>
                                <select id="p-contact" value={profile.preferred_contact} onChange={e => { setContactTouched(true); setProfile({ ...profile, preferred_contact: e.target.value }); }}>
                                    <option value="Unspecified">{t('contact_method_unspecified')}</option>
                                    {profile.preferred_contact && !CONTACT_KEYS[profile.preferred_contact] && <option value={profile.preferred_contact}>{profile.preferred_contact}</option>}
                                    {['Phone', 'Email', 'WhatsApp', 'NoPreference'].map(k => <option key={k} value={k}>{t(CONTACT_KEYS[k])}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setProfile(null)}>{t('cancel')}</button>
                            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('saving') : t('save_changes')}</button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal isOpen={!!nextForm} onClose={() => setNextForm(null)} title={t('hub_next_action')}>
                {nextForm && (
                    <form onSubmit={saveNext}>
                        <ErrorBanner error={formError} />
                        <div className="form-group">
                            <label htmlFor="n-text">{t('hub_next_action_text')}</label>
                            <input id="n-text" value={nextForm.next_action} onChange={e => setNextForm({ ...nextForm, next_action: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="n-due">{t('hub_due')}</label>
                            <input id="n-due" type="date" value={nextForm.next_action_due} onChange={e => setNextForm({ ...nextForm, next_action_due: e.target.value })} />
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setNextForm(null)}>{t('cancel')}</button>
                            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('saving') : t('save_changes')}</button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
};

export default ClientHub;
