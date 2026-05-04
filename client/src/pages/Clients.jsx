import React, { useState, useEffect } from 'react';
import { Search, Plus, Filter, Edit2, Trash2, Mail } from 'lucide-react';
import Modal from '../components/Modal';
import { useLanguage } from '../context/LanguageContext';
import { API_URL, authHeaders } from '../utils/api';

const Clients = () => {
    const { t } = useLanguage();
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        company: '',
        phone: '',
        service_type: '',
        social_platform: '',
        preferred_contact: 'Phone',
        notes: '',
        status: 'New'
    });

    // Pipeline/Status Modal State
    const [editingClient, setEditingClient] = useState(null);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [statusData, setStatusData] = useState({ status: '', additionalInfo: '' });

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        try {
            const res = await fetch(`${API_URL}/api/clients`, {
                headers: authHeaders()
            });
            if (!res.ok) throw new Error('API not available');
            const json = await res.json();
            setClients(json.data || json);
        } catch (error) {
            console.warn('Backend not connected, using LocalStorage (Demo Mode)');
            const saved = localStorage.getItem('crm_clients_demo');
            if (saved) setClients(JSON.parse(saved));
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const isEditing = !!formData.id;

        try {
            const res = await fetch(
                isEditing ? `${API_URL}/api/clients/${formData.id}` : `${API_URL}/api/clients`,
                {
                    method: isEditing ? 'PUT' : 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify(formData)
                }
            );

            if (res.ok) {
                fetchClients();
            } else {
                throw new Error('API failed');
            }
        } catch (error) {
            // Fallback to LocalStorage (Demo Mode)
            console.warn('Saving to LocalStorage (Demo Mode)');
            if (isEditing) {
                const updatedClients = clients.map(c => c.id === formData.id ? { ...c, ...formData } : c);
                setClients(updatedClients);
                localStorage.setItem('crm_clients_demo', JSON.stringify(updatedClients));
            } else {
                const newClient = { ...formData, id: Date.now(), created_at: new Date().toISOString() };
                const updatedClients = [newClient, ...clients];
                setClients(updatedClients);
                localStorage.setItem('crm_clients_demo', JSON.stringify(updatedClients));
            }
        }

        // Reset Form
        setIsModalOpen(false);
        setFormData({
            name: '', email: '', company: '', phone: '',
            service_type: '', social_platform: '', preferred_contact: 'Phone', notes: '', status: 'New'
        });
    };

    const handleStatusClick = (client) => {
        setEditingClient(client);
        setStatusData({ status: client.status || 'New', additionalInfo: '' });
        setStatusModalOpen(true);
    };

    const handleStatusUpdate = async () => {
        if (!editingClient) return;

        const updatedFields = { status: statusData.status };
        if (statusData.status === 'Won') updatedFields.deal_value = statusData.additionalInfo;
        if (statusData.status === 'Lost') updatedFields.lost_reason = statusData.additionalInfo;
        if (statusData.status === 'Meeting') updatedFields.meeting_date = statusData.additionalInfo;

        // Optimistic UI Update (for Demo Mode & Fast UI)
        const updatedList = clients.map(c => c.id === editingClient.id ? { ...c, ...updatedFields } : c);
        setClients(updatedList);
        localStorage.setItem('crm_clients_demo', JSON.stringify(updatedList));

        // Try Backend Update
        try {
            await fetch(`${API_URL}/api/clients/${editingClient.id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify(updatedFields)
            });
            // If successful, maybe refetch or just leave it
        } catch (e) {
            console.warn('Backend update failed, kept local change');
        }
        setStatusModalOpen(false);
    };

    const handleEdit = (client) => {
        setFormData({
            ...client,
            preferred_contact: client.preferred_contact || 'Phone'
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this client?')) return;

        // Optimistic UI
        const updatedList = clients.filter(c => c.id !== id);
        setClients(updatedList);
        localStorage.setItem('crm_clients_demo', JSON.stringify(updatedList));

        try {
            await fetch(`${API_URL}/api/clients/${id}`, {
                method: 'DELETE',
                headers: authHeaders()
            });
        } catch (e) {
            console.warn('Backend delete failed, kept local change');
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
                    <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
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
                                                <span className="font-medium">{client.name}</span>
                                                <span className="text-xs text-gray-400">{client.company}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                                            <span>{client.phone}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>{client.email}</span>
                                            {client.preferred_contact && (
                                                <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>
                                                    Pref: {client.preferred_contact}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td>{client.service_type || '-'}</td>
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
                                                title={t('delete')}
                                                onClick={() => handleDelete(client.id)}
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

            {/* Add / Edit Client Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setFormData({ name: '', email: '', company: '', phone: '', service_type: '', social_platform: '', preferred_contact: 'Phone', notes: '', status: 'New' }); }}
                title={formData.id ? t('edit_client') : t('add_new_client')}
            >
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
                                onChange={handleInputChange}
                            >
                                <option value="Phone">{t('contact_method_phone')}</option>
                                <option value="Email">{t('contact_method_email')}</option>
                                <option value="WhatsApp">{t('contact_method_whatsapp')}</option>
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
                        <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                            {t('cancel')}
                        </button>
                        <button type="submit" className="btn btn-primary">
                            {t('save_client')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Status Update Modal */}
            <Modal isOpen={statusModalOpen} onClose={() => setStatusModalOpen(false)} title={t('select_status')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                        <button className="btn btn-primary" onClick={handleStatusUpdate}>{t('save_changes')}</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Clients;
