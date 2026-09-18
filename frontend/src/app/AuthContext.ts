import { createContext } from 'react';
import type { AuthContextValue } from '../types/auth';

/** null outside <AuthProvider>; read it through useAuth(). */
export const AuthContext = createContext<AuthContextValue | null>(null);
