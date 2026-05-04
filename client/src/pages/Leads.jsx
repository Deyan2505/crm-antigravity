import React, { useState, useEffect } from 'react';
import { Mail, Info } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { API_URL, authHeaders } from '../utils/api';

const Leads = () => {
    const { t } = useLanguage();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLeads();
    }, []);

    const fetchLeads = async () => {
        try {
            const res = await fetch(`${API_URL}/api/leads`, {
                headers: authHeaders()
            });
            if (!res.ok) throw new Error('API failed');
            const data = await res.json();
            setLeads(data);
        } catch (error) {
            console.error('Fetch leads error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container">
            <div className="card" style={{ borderLeft: '4px solid var(--accent)', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{ padding: '8px', backgroundColor: 'var(--accent-glow)', borderRadius: '8px', color: 'var(--accent)' }}>
                        <Info size={24} />
                    </div>
                    <div>
                        <h3 style={{ marginBottom: '0.5rem' }}>{t('leads')}</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                            {t('leads_explanation')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="table-container">
                {loading ? (
                    <div className="loading-state">Loading...</div>
                ) : leads.length === 0 ? (
                    <div className="empty-state-table">
                        <p>No leads received yet.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Source</th>
                                <th>Created At</th>
                                <th>Name / Email</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leads.map(lead => (
                                <tr key={lead.id}>
                                    <td>
                                        <span className="status-badge">{lead.source}</span>
                                    </td>
                                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        {new Date(lead.created_at).toLocaleString()}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span className="font-medium">{lead.data?.name || 'N/A'}</span>
                                            <span className="text-xs text-gray-400">{lead.data?.email || 'N/A'}</span>
                                        </div>
                                    </td>
                                    <td style={{ fontSize: '0.85rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {lead.data?.notes || lead.data?.message || '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default Leads;
