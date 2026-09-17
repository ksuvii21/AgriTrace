import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../config/firebase";
import { getCurrentUser, registerProfile } from "../api/authApi";

import {
  loginUser,
  registerUser,
  logoutUser,
} from "../services/authService";
import websocketService from "../services/websocketService";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  // firebaseLoading: Firebase session resolution
  // profileLoading:  backend profile fetch
  const [firebaseLoading, setFirebaseLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);

  // Track the Firebase session.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
      setFirebaseLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch the backend (MongoDB) profile whenever the Firebase user changes.
  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      if (!user) {
        setProfile(null);
        setProfileError(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      setProfileError(null);
      try {
        // Returns { uid, email, profile } where `profile` is the MongoDB
        // user document (with `role`) or null if it has not been created yet.
        const data = await getCurrentUser();
        if (cancelled) return;
        setProfile(data?.profile ?? null);
        setProfileError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch user profile', err);
        setProfile(null);
        setProfileError(err);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const refreshProfile = async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const data = await getCurrentUser();
      setProfile(data?.profile ?? null);
      setProfileError(null);
    } catch (err) {
      console.error('Failed to refresh profile', err);
      setProfileError(err);
    } finally {
      setProfileLoading(false);
    }
  };

  // Auto-provision a FARMER profile when a user logs in without one.
  // Runs only after the profile fetch completes and confirms no profile exists.
  useEffect(() => {
    if (!user || profile !== null || profileError) return;
    if (profileLoading) return;

    let cancelled = true;
    const provision = async () => {
      try {
        await registerProfile("FARMER");
        await refreshProfile();
      } catch (err) {
        if (cancelled && err.status !== 409) {
          console.error("Failed to auto-provision profile", err);
        }
      }
    };
    provision();
    return () => { cancelled = false; };
  }, [user, profile, profileLoading, profileError]);

  const login = async (email, password) => {
    return await loginUser(email, password);
  };

  /**
   * Register a new user: create the Firebase account, then create the
   * Mongo business profile via the backend (POST /auth/register).
   * `role` must be FARMER | TRANSPORTER | WAREHOUSE | RETAILER.
   */
  const register = async (name, email, password, role) => {
    const firebaseUser = await registerUser(name, email, password);
    try {
      await registerProfile(role);
    } catch (err) {
      // The Firebase account exists; surface the profile error so the UI can
      // show it. The profile effect will retry on next auth state change.
      console.error('Failed to create backend profile', err);
      throw err;
    }
    return firebaseUser;
  };

  const logout = async () => {
    // Tear down the live socket before ending the Firebase session.
    websocketService.disconnect();
    await logoutUser();
    setUser(null);
    setProfile(null);
    setProfileError(null);
  };

   const value = {
     user,
     profile,
     role: profile?.role ?? null,
     profileExists: profile != null,
     authLoading: firebaseLoading || profileLoading,
     firebaseLoading,
     profileLoading,
     profileError,
     login,
     register,
     logout,
     refreshProfile,
     isAuthenticated: !!user,
   };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
};