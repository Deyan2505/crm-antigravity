import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Filter, Edit2, Trash2, Mail } from 'lucide-react';
import Modal from '../components/Modal';
import { useLanguage } from '../context/LanguageContext';
import ErrorBanner from '../components/ErrorBanner';
import { apiFetch } from '../utils/api';
import { ApiError } from '../utils/apiCore';

const EMPTY_FORM = {
    name: '', email: '', company: '', phone: '', service_type: '', social_platform: '',
    preferred_contact: 'Unspecified', notes: '', status: 'New'
};

const Clients = () => {
    const { t } = useLanguage();
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [formError, setFormError] = useState(null);   // shown inside the add/edit modal
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);            // list load / delete errors
    const [total, setTotal] = useState(0);

    // Pipeline/Status Modal State
    const [editingClient, setEditingClient] = useState(null);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [statusData, setStatusData] = useState({ status: '', additionalInfo: '' });
    const [statusError, setStatusError] = useState(null);

    useEffect(() => {
        // Demo Mode (clients kept only in this browser) no longer exists: remove what an older version left behind.
        try { localStorage.removeItem('crm_clients_demo'); } catch { /* storage unavailable */ }
        fetchClients();
    }, []);

    const fetchClients = async () => {
        try {
            const json = await apiFetch('/api/clients?limit=200');
            if (!Array.isArray(json.data)) throw new ApiError(200, 'BAD_RESPONSE');
            setClients(json.data);
            setTotal(Number(json.total) || json.data.length);
            setError(null);
        } catch (err) {
            setError(err); // the list on screen (if any) is the last confirmed one
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const CONTACT_KEYS = { Phone: 'contact_method_phone', Email: 'contact_method_email', WhatsApp: 'contact_method_whatsapp', NoPreference: 'contact_method_none', Unspecified: 'contact_method_unspecified' };
    // Editing never rewrites the stored preference unless the select was used (an empty or old free-text value stays as it is).
    const [contactTouched, setContactTouched] = useState(false);

    const closeModal = () => {
        setIsModalOpen(false);
        setFormData(EMPTY_FORM);
        setFormError(null);
    };

    const openCreate = () => {
        setFormData(EMPTY_FORM);
        setContactTouched(false);
        setFormError(null);
        setIsModalOpen(true);
    };

    // The form closes and the list changes only after the server confirmed the save; on any error the modal stays open with the data.
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        if (!formData.name || !formData.name.trim()) { setFormError(new ApiError(400, 'VALIDATION', t('name_required'))); return; }
        const isEditing = !!formData.id;
        const payload = { ...formData };
        if (isEditing && !contactTouched) delete payload.preferred_contact;

        setSaving(true);
        setFormError(null);
        try {
            await apiFetch(isEditing ? `/api/clients/${formData.id}` : '/api/clients', { method: isEditing ? 'PUT' : 'POST', body: payload });
            closeModal();
            await fetchClients();
        } catch (err) {
            setFormError(err);
        } finally {
            setSaving(false);
        }
    };

    const handleStatusClick = (client) => {
        setEditingClient(client);
        setStatusData({ status: client.status || 'New', additionalInfo: '' });
        setStatusError(null);
        setStatusModalOpen(true);
    };

    const handleStatusUpdate = async () => {
        if (!editingClient || saving) return;
        const extra = String(statusData.additionalInfo || '').trim();
        const fields = { status: statusData.status };
        if (statusData.status === 'Won' && extra) {
            if (!Number.isFinite(Number(extra.replace(',', '.')))) { setStatusError(new ApiError(400, 'VALIDATION', t('amount_invalid'))); return; }
            fields.deal_value = extra;
        }
        if (statusData.status === 'Lost' && extra) fields.lost_reason = extra;
        if (statusData.status === 'Meeting' && extra) {
            if (Number.isNaN(Date.parse(extra))) { setStatusError(new ApiError(400, 'VALIDATION', t('date_invalid'))); return; }
            fields.meeting_date = extra;
        }

        setSaving(true);
        setStatusError(null);
        try {
            await apiFetch(`/api/clients/${editingClient.id}`, { method: 'PUT', body: fields });
            setStatusModalOpen(false);
            await fetchClients();
        } catch (err) {
            setStatusError(err); // the status in the list is unchanged until the server confirms
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (client) => {
        setFormData({
            ...client,
            preferred_contact: client.preferred_contact || 'Unspecified'
        });
        setContactTouched(false);
        setIsModalOpen(true);
    };

    // Clients that came from a Tally form are kept (the server refuses too): deleting them would lose the key that stops the same
    // submission from being imported again. Archiving replaces deletion in Stage 2.
    const handleDelete = async (client) => {
        if (client.tally_submission_id) return;
        if (!window.confirm(t('confirm_delete_client'))) return;
        setError(null);
        try {
            await apiFetch(`/api/clients/${client.id}`, { method: 'DELETE' });
            await fetchClients();
        } catch (err) {
            setError(err);
            if (err.status === 404) fetchClients(); // already gone: show the real list
        }
    };

    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusColor = (status) => {
        const s = status?.toLowerCase() || 'new';
        if (s === 'won') return 'bg-emerald-500/20 text-emerald-400';
        if (s === 'lost') return 'bg-red-500/20 text-red-400';
        if (s === 'meeting') return 'bg-purple-500/20 text-purple-400';
        if (s === 'proposal') return 'bg-yellow-500/20 text-yellow-400';
        return 'bg-blue-500/20 text-blue-400';
    };

    return (
        <div className="page-container">
            <ErrorBanner error={error} onClose={() => setError(null)} />
            <div className="page-header">
                <div className="search-bar">
                    <Search size={20} className="search-icon" />
                    <input
                        type="text"
                        placeholder={t('search_clients')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="actions">
                    <button className="btn btn-secondary">
                        <Filter size={18} />
                        {t('filter')}
                    </button>
                    <button className="btn btn-primary" onClick={openCreate}>
                        <Plus size={18} />
                        {t('add_client')}
                    </button>
                </div>
            </div>

            <div className="table-container">
                {loading ? (
                    <div className="loading-state">Loading...</div>
                ) : filteredClients.length === 0 ? (
                    <div className="empty-state-table">
                        <p>No clients found.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('name')}</th>
                                <th>{t('contact_method_phone')} / {t('contact_method_email')}</th>
                                <th>{t('service')}</th>
                                <th>{t('status')}</th>
                                <th>{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClients.map(client => (
                                <tr key={client.id}>
                                    <td>
                                        <div className="client-name-cell">
                                            <div className="avatar-sm">{client.name.charAt(0)}</div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <Link to={`/app/clients/${client.id}`} className="client-link font-medium" title={t('hub_open')}>{client.name}</Link>
                                                <span className="text-xs text-gray-400">{client.company}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                                            <span>{client.phone}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>{client.email}</span>
                                            {client.preferred_contact && client.preferred_contact !== 'Unspecified' && (
                                                <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>
                                                    {t('preferred_contact')}: {CONTACT_KEYS[client.preferred_contact] ? t(CONTACT_KEYS[client.preferred_contact]) : client.preferred_contact}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    {/* Portfolio enquiries: the project the client chose in the form (project_type); the calculator's services stay in service_type. Not chosen -> "Not specified", never a guessed service. */}
                                    <td>{client.track === 'portfolio' ? (client.project_type || t('not_specified')) : (client.service_type || '-')}</td>
                                    <td>
                                        <button
                                            className={`status-badge ${getStatusColor(client.status)}`}
                                            onClick={() => handleStatusClick(client)}
                                            style={{ border: 'none', cursor: 'pointer' }}
                                        >
                                            {t(`status_${client.status?.toLowerCase()}`) || client.status}
                                        </button>
                                    </td>
                                    <td className="actions-cell">
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className="btn-icon"
                                                title={t('edit')}
                                                onClick={() => handleEdit(client)}
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                className="btn-icon"
                                                title={t('send_email')}
                                                onClick={() => window.location.href = `mailto:${client.email}`}
                                            >
                                                <Mail size={16} />
                                            </button>
                                            <button
                                                className="btn-icon text-red-500"
                                                title={client.tally_submission_id ? t('delete_blocked_tally') : t('delete')}
                                                onClick={() => handleDelete(client)}
                                                disabled={!!client.tally_submission_id}
                                                style={client.tally_submission_id ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                                            >
                                                <Trash2 size={16} color="#ef4444" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {total > clients.length && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                    {t('clients_shown_of').replace('{shown}', clients.length).replace('{total}', total)}
                </p>
            )}

            {/* Add / Edit Client Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={closeModal}
                title={formData.id ? t('edit_client') : t('add_new_client')}
            >
                <ErrorBanner error={formError} />
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>{t('name')}</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>{t('company')}</label>
                        <input
                            type="text"
                            name="company"
                            value={formData.company}
                            onChange={handleInputChange}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>{t('email')}</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('phone')}</label>
                            <input
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleInputChange}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>{t('service')}</label>
                        <input
                            type="text"
                            name="service_type"
                            value={formData.service_type}
                            onChange={handleInputChange}
                            placeholder="e.g. Web Design"
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>{t('social')}</label>
                            <input
                                type="text"
                                name="social_platform"
                                value={formData.social_platform}
                                onChange={handleInputChange}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('preferred_contact')}</label>
                            <select
                                name="preferred_contact"
                                value={formData.preferred_contact}
                                onChange={(e) => { setContactTouched(true); handleInputChange(e); }}
                            >
                                <option value="Unspecified">{t('contact_method_unspecified')}</option>
                                {formData.preferred_contact && !CONTACT_KEYS[formData.preferred_contact] && (
                                    <option value={formData.preferred_contact}>{formData.preferred_contact}</option>
                                )}
                                <option value="Phone">{t('contact_method_phone')}</option>
                                <option value="Email">{t('contact_method_email')}</option>
                                <option value="WhatsApp">{t('contact_method_whatsapp')}</option>
                                <option value="NoPreference">{t('contact_method_none')}</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>{t('notes')}</label>
                        <textarea
                            name="notes"
                            value={formData.notes}
                            onChange={handleInputChange}
                            rows="3"
                        />
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={closeModal}>
                            {t('cancel')}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? t('saving') : t('save_client')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Status Update Modal */}
            <Modal isOpen={statusModalOpen} onClose={() => setStatusModalOpen(false)} title={t('select_status')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <ErrorBanner error={statusError} />
                    <div className="form-group">
                        <label>{t('status')}</label>
                        <select
                            style={{
                                width: '100%', padding: '0.75rem',
                                backgroundColor: 'var(--bg-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius)',
                                color: 'var(--text-primary)'
                            }}
                            value={statusData.status}
                            onChange={(e) => setStatusData({ ...statusData, status: e.target.value })}
                        >
                            <option value="New">{t('status_new')}</option>
                            <option value="Contacted">{t('status_contacted')}</option>
                            <option value="Meeting">{t('status_meeting')}</option>
                            <option value="Proposal">{t('status_proposal')}</option>
                            <option value="Won">{t('status_won')}</option>
                            <option value="Lost">{t('status_lost')}</option>
                        </select>
                    </div>

                    {statusData.status === 'Won' && (
                        <div className="form-group">
                            <label>{t('deal_value')}</label>
                            <input
                                type="number"
                                placeholder="1000"
                                value={statusData.additionalInfo}
                                onChange={(e) => setStatusData({ ...statusData, additionalInfo: e.target.value })}
                            />
                        </div>
                    )}

                    {statusData.status === 'Lost' && (
                        <div className="form-group">
                            <label>{t('lost_reason')}</label>
                            <textarea
                                placeholder="e.g. Price too high..."
                                value={statusData.additionalInfo}
                                onChange={(e) => setStatusData({ ...statusData, additionalInfo: e.target.value })}
                            />
                        </div>
                    )}

                    {statusData.status === 'Meeting' && (
                        <div className="form-group">
                            <label>{t('meeting_date')}</label>
                            <input
                                type="datetime-local"
                                value={statusData.additionalInfo}
                                onChange={(e) => setStatusData({ ...statusData, additionalInfo: e.target.value })}
                            />
                        </div>
                    )}

                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={() => setStatusModalOpen(false)}>{t('cancel')}</button>
                        <button className="btn btn-primary" onClick={handleStatusUpdate} disabled={saving}>{saving ? t('saving') : t('save_changes')}</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Clients;
