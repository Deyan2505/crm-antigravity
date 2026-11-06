import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { errorKey } from '../utils/apiCore';

// Shows why an API call failed, in the user's language. For 400 the server's message (which field is wrong) is appended.
const ErrorBanner = ({ error, onClose }) => {
    const { t } = useLanguage();
    if (!error) return null;
    const detail = error.status === 400 && error.message ? `: ${error.message}` : '';
    return (
        <div role="alert" className="error-banner">
            <AlertTriangle size={18} />
            <span>{t(errorKey(error))}{detail}</span>
            {onClose && <button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>}
        </div>
    );
};

export default ErrorBanner;
