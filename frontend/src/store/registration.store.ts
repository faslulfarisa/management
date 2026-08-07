import { create } from 'zustand';

const STORAGE_KEY = 'registration_session';

interface RegistrationSessionData {
  registrationId: string;
  accessToken: string;
  email: string;
  fullName: string;
  mobile?: string;
}

interface RegistrationState {
  session: RegistrationSessionData | null;
  setSession: (session: RegistrationSessionData) => void;
  clear: () => void;
  hydrate: () => void;
}

export const useRegistrationStore = create<RegistrationState>((set) => ({
  session: null,

  // localStorage (not sessionStorage) so the session survives the email
  // verification link opening in a new tab — sessionStorage doesn't carry
  // over to tabs opened from another app (e.g. a mail client).
  hydrate: () => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    set({ session: raw ? JSON.parse(raw) : null });
  },

  setSession: (session) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    set({ session });
  },

  clear: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ session: null });
  },
}));
