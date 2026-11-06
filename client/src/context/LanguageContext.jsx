import React, { createContext, useState, useContext, useEffect } from 'react';
import { translations } from '../utils/translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
    const [language, setLanguageState] = useState(() => {
        try { const saved = localStorage.getItem('crm_lang'); if (saved in translations) return saved; } catch { /* storage unavailable */ }
        return 'bg'; // default: Bulgarian
    });
    const setLanguage = (lang) => {
        setLanguageState(lang);
        try { localStorage.setItem('crm_lang', lang); } catch { /* storage unavailable */ }
    };

    useEffect(() => {
        // Handle RTL for Hebrew
        document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
        document.documentElement.lang = language;
    }, [language]);

    const t = (key) => {
        return translations[language][key] || key;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => useContext(LanguageContext);
