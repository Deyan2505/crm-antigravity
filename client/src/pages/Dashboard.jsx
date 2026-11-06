import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Users, FileText, Calendar, TrendingUp } from 'lucide-react';
import ErrorBanner from '../components/ErrorBanner';
import { apiFetch } from '../utils/api';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

const Dashboard = () => {
    const { t } = useLanguage();
    const [stats, setStats] = useState({
        totalClients: 0,
        totalLeads: 0,
        newClients: 0,
        meetingsCount: 0
    });
    const [monthlyData, setMonthlyData] = useState({ labels: [], counts: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchStats();
        fetchMonthlyStats();
    }, []);

    const fetchStats = async () => {
        try {
            setStats(await apiFetch('/api/dashboard/stats'));
            setError(null);
        } catch (err) {
            setError(err); // the numbers show "-" instead of a misleading 0
        } finally {
            setLoading(false);
        }
    };

    const fetchMonthlyStats = async () => {
        try {
            setMonthlyData(await apiFetch('/api/dashboard/monthly-stats'));
        } catch (err) {
            setError(err);
        }
    };

    const chartData = {
        labels: monthlyData.labels,
        datasets: [
            {
                label: t('stats_clients'),
                data: monthlyData.counts,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        plugins: {
            legend: {
                display: false,
            },
            title: {
                display: false,
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                }
            },
            x: {
                grid: {
                    display: false
                }
            }
        }
    };

    return (
        <div className="dashboard-container">
            <h2 style={{ marginBottom: '1.5rem' }}>{t('dashboard')}</h2>
            <ErrorBanner error={error} onClose={() => setError(null)} />

            <div className="dashboard-grid">
                <div className="card stat-card">
                    <div className="stat-icon-wrapper blue">
                        <Users size={24} />
                    </div>
                    <div>
                        <h3>{t('stats_clients')}</h3>
                        <p className="stat-value">{loading || error ? '-' : stats.totalClients}</p>
                    </div>
                </div>

                <div className="card stat-card">
                    <div className="stat-icon-wrapper green">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h3>{t('leads')}</h3>
                        <p className="stat-value">{loading || error ? '-' : stats.totalLeads}</p>
                    </div>
                </div>

                <div className="card stat-card">
                    <div className="stat-icon-wrapper purple">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <h3>{t('possible_deals')}</h3>
                        <p className="stat-value">{loading || error ? '-' : stats.newClients}</p>
                    </div>
                </div>

                <div className="card stat-card">
                    <div className="stat-icon-wrapper orange">
                        <Calendar size={24} />
                    </div>
                    <div>
                        <h3>{t('meetings_all_time')}</h3>
                        <p className="stat-value">{loading || error ? '-' : stats.meetingsCount}</p>
                    </div>
                </div>

                <div className="card wide-card">
                    <h3 style={{ marginBottom: '1rem' }}>{t('growth_overview')}</h3>
                    <div style={{ height: '300px' }}>
                        <Line data={chartData} options={chartOptions} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
